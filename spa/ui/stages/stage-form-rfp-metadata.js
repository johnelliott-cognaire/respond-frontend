import {
    bulkDeleteDocumentItems,
    createDocumentItem,
    fetchDocumentItems,
    updateDocumentItemAttribute
} from '../../api/documents.js';
import { ErrorModal } from '../modals/error-modal.js';
import { MessageModal } from '../modals/message-modal.js';
import { TextPromptModal } from '../modals/text-prompt-modal.js';
import { YesNoModal } from '../modals/yesno-modal.js';

/**
 * RFP Metadata Stage Form
 * 
 * Manages comprehensive RFP metadata including timelines, contacts, 
 * documentation, and other critical proposal information.
 */
export default class StageFormRfpMetadata {
    /**
     * Constructor
     * @param {Object} docTaskInstance - Document task instance
     * @param {Object} jobController - Job controller instance
     */
    constructor(docTaskInstance, jobController, autoSaveManager = null) {
        this.docTaskInstance = docTaskInstance;
        this.jobController = jobController;
        this.autoSaveManager = autoSaveManager;

        // Identify the current stage ID
        const currentStageIndex = docTaskInstance.currentStageIndex || 0;
        this.currentStageId = docTaskInstance.stages?.[currentStageIndex]?.stageId
            || "rfp_stage_5_metadata";

        this.domContainer = null;
        this.errorModal = new ErrorModal();
        this.messageModal = new MessageModal();
        this.textPromptModal = new TextPromptModal();
        this.yesNoModal = new YesNoModal();

        // Track metadata by group
        this.metadataByGroup = {
            general: [],
            contacts: [],
            docs: [],
            team: []
        };

        // Field definitions for the general metadata
        this.generalFields = this._getGeneralFieldDefinitions();

        // Auto-save timeout
        this.autoSaveTimeout = null;
        this.isLoading = false;
        
        // Track field values to prevent duplicate saves
        this.fieldLastSavedValues = new Map();

        console.log(`[StageFormRfpMetadata] Initialized with stageId: ${this.currentStageId}`);
    }

    /**
     * Render the stage form
     * @param {HTMLElement} containerEl - Container element
     */
    async render(containerEl) {
        this.domContainer = containerEl;
        containerEl.innerHTML = '';

        // Create main container
        const formContainer = document.createElement('div');
        formContainer.className = 'stage-form rm-stage-form';

        // Render header
        this._renderHeader(formContainer);

        // Render quick access panel
        this._renderQuickAccess(formContainer);

        // Load existing data
        await this._loadMetadata();

        // Render all sections
        this._renderCriticalTimeline(formContainer);
        this._renderRfpIdentification(formContainer);
        this._renderSubmissionDetails(formContainer);
        this._renderContactsList(formContainer);
        this._renderDocumentationList(formContainer);
        this._renderTeamList(formContainer);
        this._renderComplianceSection(formContainer);
        this._renderOtherFields(formContainer);

        containerEl.appendChild(formContainer);

        console.log('[StageFormRfpMetadata] Rendered successfully');
    }

    /**
     * Load metadata from backend
     * @private
     */
    async _loadMetadata() {
        try {
            this.isLoading = true;

            // Get project document ID without subtenant prefix
            const projectDocumentId = this._getCleanProjectDocumentId();

            // Fetch all items for this stage (no group filter)
            const allItems = await fetchDocumentItems(projectDocumentId, this.currentStageId, null);

            // Group items by parsing the sort key
            this.metadataByGroup = {
                general: [],
                contacts: [],
                docs: [],
                team: []
            };

            allItems.forEach(item => {
                // Parse: STG#stage_id#GRP#group_id#ITEM#item_id
                const sortKeyParts = item.project_document_stage_group_id_item_id.split('#');
                const groupId = sortKeyParts[3]; // Get group_id component

                if (this.metadataByGroup[groupId]) {
                    this.metadataByGroup[groupId].push(item);
                }
            });

            console.log('[StageFormRfpMetadata] Loaded metadata:', this.metadataByGroup);

        } catch (error) {
            console.error('[StageFormRfpMetadata] Error loading metadata:', error);
            this._showError('Failed to load metadata', error.message);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Get general field definitions
     * @private
     */
    _getGeneralFieldDefinitions() {
        return [
            // Critical Timeline Fields
            {
                key: 'submission_deadline',
                label: 'Submission Deadline',
                type: 'datetime-local',
                critical: true,
                section: 'timeline'
            },
            {
                key: 'question_deadline',
                label: 'Question Submission Deadline',
                type: 'datetime-local',
                critical: true,
                section: 'timeline'
            },
            {
                key: 'response_deadline',
                label: 'Response Deadline for Questions',
                type: 'datetime-local',
                critical: true,
                section: 'timeline'
            },
            {
                key: 'award_date',
                label: 'Anticipated Award Date',
                type: 'date',
                critical: true,
                section: 'timeline'
            },
            {
                key: 'date_issued',
                label: 'Date Issued',
                type: 'date',
                section: 'timeline'
            },

            // RFP Identification
            {
                key: 'rfp_id',
                label: 'RFP ID/Reference Number',
                type: 'text',
                section: 'identification'
            },
            {
                key: 'issuing_organization',
                label: 'Issuing Organization',
                type: 'text',
                readonly: true,
                value: this._getIssuingOrganization(),
                section: 'identification'
            },
            {
                key: 'proposal_status',
                label: 'Proposal Status',
                type: 'select',
                options: ['Draft', 'Under Review', 'Submitted', 'Awarded', 'Declined'],
                section: 'identification'
            },
            {
                key: 'proposal_version',
                label: 'Proposal Version',
                type: 'text',
                section: 'identification'
            },

            // Submission Details
            {
                key: 'submission_method',
                label: 'Submission Method',
                type: 'select',
                options: ['Email', 'Online Portal', 'Physical Delivery', 'Other'],
                section: 'submission'
            },
            {
                key: 'submission_location',
                label: 'Submission Location/URL',
                type: 'url',
                section: 'submission'
            },
            {
                key: 'required_formats',
                label: 'Required Formats',
                type: 'text',
                section: 'submission'
            },
            {
                key: 'estimated_budget',
                label: 'Estimated Budget',
                type: 'number',
                section: 'submission'
            },

            // Compliance & Other
            {
                key: 'certifications',
                label: 'Required Certifications',
                type: 'textarea',
                section: 'compliance'
            },
            {
                key: 'legal_compliance',
                label: 'Legal & Regulatory Compliance Notes',
                type: 'textarea',
                section: 'compliance'
            },
            {
                key: 'risk_notes',
                label: 'Risk Management Notes',
                type: 'textarea',
                section: 'other'
            },
            {
                key: 'communication_log',
                label: 'Communication Log Notes',
                type: 'textarea',
                section: 'other'
            }
        ];
    }

    /**
     * Render header section
     * @private
     */
    _renderHeader(container) {
        const header = document.createElement('div');
        header.innerHTML = `
      <h2 class="rm-stage-title">
        <i class="fas fa-clipboard-list"></i>
        Submission Details and Metadata
      </h2>
      <p class="rm-stage-description">
        Manage all critical RFP information including deadlines, contacts, documentation, 
        and compliance requirements. This centralized metadata helps track proposal progress 
        and ensures no critical details are missed.
      </p>
    `;
        container.appendChild(header);
    }

    /**
     * Render quick access navigation
     * @private
     */
    _renderQuickAccess(container) {
        const quickAccess = document.createElement('div');
        quickAccess.className = 'rm-quick-access';
        quickAccess.innerHTML = `
      <div class="rm-quick-access-title">Quick Access</div>
      <div class="rm-quick-links">
        <a href="#timeline" class="rm-quick-link">⏰ Deadlines</a>
        <a href="#identification" class="rm-quick-link">📋 RFP Details</a>
        <a href="#submission" class="rm-quick-link">📤 Submission</a>
        <a href="#contacts" class="rm-quick-link">👥 Contacts</a>
        <a href="#docs" class="rm-quick-link">📄 Documents</a>
        <a href="#team" class="rm-quick-link">🏢 Team</a>
      </div>
    `;
        container.appendChild(quickAccess);
    }

    /**
     * Render critical timeline section
     * @private
     */
    _renderCriticalTimeline(container) {
        const section = this._createSection('timeline', '⏰ Critical Timeline & Deadlines');

        const fieldsGrid = document.createElement('div');
        // Change this line from 'rm-fields-grid--two-column' to just 'rm-fields-grid'
        fieldsGrid.className = 'rm-fields-grid';

        const timelineFields = this.generalFields.filter(f => f.section === 'timeline');
        timelineFields.forEach(field => {
            const fieldElement = this._createFieldElement(field);
            if (field.critical) {
                fieldElement.classList.add('rm-deadline-field');
            }
            fieldsGrid.appendChild(fieldElement);
        });

        section.appendChild(fieldsGrid);
        container.appendChild(section);
    }

    /**
     * Render RFP identification section
     * @private
     */
    _renderRfpIdentification(container) {
        const section = this._createSection('identification', '📋 RFP Identification');

        const fieldsGrid = document.createElement('div');
        fieldsGrid.className = 'rm-fields-grid';

        const identificationFields = this.generalFields.filter(f => f.section === 'identification');
        identificationFields.forEach(field => {
            fieldsGrid.appendChild(this._createFieldElement(field));
        });

        section.appendChild(fieldsGrid);
        container.appendChild(section);
    }

    /**
     * Render submission details section
     * @private
     */
    _renderSubmissionDetails(container) {
        const section = this._createSection('submission', '📤 Submission Details');

        const fieldsGrid = document.createElement('div');
        fieldsGrid.className = 'rm-fields-grid';

        const submissionFields = this.generalFields.filter(f => f.section === 'submission');
        submissionFields.forEach(field => {
            fieldsGrid.appendChild(this._createFieldElement(field));
        });

        section.appendChild(fieldsGrid);
        container.appendChild(section);
    }

    /**
     * Render contacts list section
     * @private
     */
    _renderContactsList(container) {
        const section = this._createSection('contacts', '👥 Points of Contact');

        const listSection = this._createListSection(
            'contacts',
            'Add Contact',
            () => this._addContact()
        );

        section.appendChild(listSection);
        container.appendChild(section);

        this._renderContactItems();
    }

    /**
     * Render documentation list section
     * @private
     */
    _renderDocumentationList(container) {
        const section = this._createSection('docs', '📄 Documentation & Links');

        const listSection = this._createListSection(
            'docs',
            'Add Document',
            () => this._addDocument()
        );

        section.appendChild(listSection);
        container.appendChild(section);

        this._renderDocumentItems();
    }

    /**
     * Render team list section
     * @private
     */
    _renderTeamList(container) {
        const section = this._createSection('team', '🏢 Project Team');

        const listSection = this._createListSection(
            'team',
            'Add Team Member',
            () => this._addTeamMember()
        );

        section.appendChild(listSection);
        container.appendChild(section);

        this._renderTeamItems();
    }

    /**
     * Render compliance section
     * @private
     */
    _renderComplianceSection(container) {
        const section = this._createSection('compliance', '✅ Compliance & Requirements');

        const fieldsGrid = document.createElement('div');
        fieldsGrid.className = 'rm-fields-grid--single-column';

        const complianceFields = this.generalFields.filter(f => f.section === 'compliance');
        complianceFields.forEach(field => {
            fieldsGrid.appendChild(this._createFieldElement(field));
        });

        section.appendChild(fieldsGrid);
        container.appendChild(section);
    }

    /**
     * Render other fields section
     * @private
     */
    _renderOtherFields(container) {
        const section = this._createSection('other', '📝 Additional Notes');

        const fieldsGrid = document.createElement('div');
        fieldsGrid.className = 'rm-fields-grid--single-column';

        const otherFields = this.generalFields.filter(f => f.section === 'other');
        otherFields.forEach(field => {
            fieldsGrid.appendChild(this._createFieldElement(field));
        });

        section.appendChild(fieldsGrid);
        container.appendChild(section);
    }

    /**
     * Create a section container
     * @private
     */
    _createSection(id, title) {
        const section = document.createElement('div');
        section.className = 'rm-section';
        section.id = id;

        const titleElement = document.createElement('h3');
        titleElement.className = 'rm-section-title';
        titleElement.innerHTML = title;

        section.appendChild(titleElement);
        return section;
    }

    /**
     * Create a list section
     * @private
     */
    _createListSection(groupId, addButtonText, addCallback) {
        const listSection = document.createElement('div');
        listSection.className = 'rm-list-section';

        const header = document.createElement('div');
        header.className = 'rm-list-header';

        const addButton = document.createElement('button');
        addButton.className = 'rm-add-item-btn';
        addButton.innerHTML = `<i class="fas fa-plus"></i> ${addButtonText}`;
        addButton.addEventListener('click', addCallback);

        header.appendChild(addButton);

        const listContainer = document.createElement('div');
        listContainer.className = 'rm-list-container';
        listContainer.id = `${groupId}-list`;

        listSection.appendChild(header);
        listSection.appendChild(listContainer);

        return listSection;
    }

    /**
     * Create a field element
     * @private
     */
    _createFieldElement(field) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = field.label;
        label.htmlFor = field.key;

        let input;

        if (field.type === 'select') {
            input = document.createElement('select');
            input.innerHTML = '<option value="">Select...</option>';

            if (field.options) {
                field.options.forEach(option => {
                    const optionEl = document.createElement('option');
                    optionEl.value = option;
                    optionEl.textContent = option;
                    input.appendChild(optionEl);
                });
            }
        } else if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else {
            input = document.createElement('input');
            input.type = field.type || 'text';
        }

        input.id = field.key;
        input.name = field.key;

        if (field.readonly) {
            input.readOnly = true;
            input.value = field.value || '';
        }

        // Set existing value
        const existingItem = this.metadataByGroup.general.find(item => item.field_name === field.key);
        if (existingItem) {
            input.value = existingItem.field_value || '';
        }

        // Track initial value to prevent duplicate saves
        this.fieldLastSavedValues.set(field.key, input.value);
        
        // Add auto-save listener with duplicate prevention
        input.addEventListener('input', () => {
            this._scheduleAutoSave(field.key, input.value);
        });
        
        input.addEventListener('blur', () => {
            // Clear any pending debounced save and save immediately if value changed
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = null;
            }
            
            // Only save if value actually changed since last save
            const lastSaved = this.fieldLastSavedValues.get(field.key) || '';
            if (input.value !== lastSaved) {
                this._handleFieldChange(field.key, input.value);
            }
        });

        formGroup.appendChild(label);
        formGroup.appendChild(input);

        return formGroup;
    }

    /**
     * Handle field value changes
     * @private
     */
    async _handleFieldChange(fieldKey, value) {
        try {
            const projectDocumentId = this._getCleanProjectDocumentId();

            // Find existing item
            let existingItem = this.metadataByGroup.general.find(item => item.field_name === fieldKey);

            if (existingItem) {
                // Update existing item
                await updateDocumentItemAttribute(
                    projectDocumentId,
                    this.currentStageId,
                    'general',
                    existingItem.project_document_stage_group_id_item_id,
                    'field_value',
                    value
                );

                existingItem.field_value = value;

                // Track successful DocumentItems save
                this._trackDocumentItemSave('form-field', 'success', {
                    fieldName: fieldKey,
                    value: value
                });
            } else {
                // Create new item
                const newItem = await createDocumentItem(
                    projectDocumentId,
                    this.currentStageId,
                    'general',
                    {
                        field_name: fieldKey,
                        field_value: value,
                        item_type: 'general_field'
                    }
                );

                this.metadataByGroup.general.push(newItem);

                // Track successful DocumentItems save
                this._trackDocumentItemSave('create-item', 'success', {
                    fieldName: fieldKey,
                    itemId: newItem.project_document_stage_group_id_item_id
                });
            }

            console.log(`[StageFormRfpMetadata] Updated field ${fieldKey}:`, value);
            
            // Update tracked value to prevent duplicate saves
            this.fieldLastSavedValues.set(fieldKey, value);

        } catch (error) {
            console.error('[StageFormRfpMetadata] Error updating field:', error);

            // Track failed DocumentItems save
            this._trackDocumentItemSave('form-field', 'error', {
                fieldName: fieldKey,
                error: error.message
            });

            this._showError('Failed to save field', error.message);
        }
    }

    /**
     * Track DocumentItems save operation via AutoSaveManager
     * @private
     */
    _trackDocumentItemSave(operation, status, details = {}) {
        if (this.autoSaveManager && this.autoSaveManager.trackDocumentItemSave) {
            this.autoSaveManager.trackDocumentItemSave(operation, status, details);
        } else {
            console.log(`[StageFormRfpMetadata] DocumentItems ${operation} ${status}:`, details);
        }
        
        // Update stageData to indicate that form data has been saved
        if (status === 'success' && this.docTaskInstance) {
            if (!this.docTaskInstance.stageData) {
                this.docTaskInstance.stageData = {};
            }
            if (!this.docTaskInstance.stageData[this.currentStageId]) {
                this.docTaskInstance.stageData[this.currentStageId] = {};
            }
            // Set hasData flag to indicate that at least one value has been saved
            this.docTaskInstance.stageData[this.currentStageId].hasData = true;
            
            // Mark document as dirty to trigger save
            this.docTaskInstance.isDirty = true;
        }
    }

    /**
     * Schedule auto-save with debouncing
     * @private
     */
    _scheduleAutoSave(fieldKey, value) {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        this.autoSaveTimeout = setTimeout(() => {
            // Only save if value actually changed since last save
            const lastSaved = this.fieldLastSavedValues.get(fieldKey) || '';
            if (value !== lastSaved) {
                this._handleFieldChange(fieldKey, value);
            }
        }, 1000); // 1 second debounce
    }

    /**
     * Add new contact
     * @private
     */
    async _addContact() {
        this._promptForContact({
            name: '',
            email: '',
            role: '',
            phone: ''
        });
    }

    /**
     * Prompt for contact information using chained modals
     * @private
     */
    _promptForContact(contactData) {
        this.textPromptModal.show({
            title: 'Add Contact',
            message: 'Enter the contact name:',
            defaultValue: contactData.name,
            onOk: (name) => {
                if (!name.trim()) {
                    this._showError('Validation Error', 'Contact name is required.');
                    return;
                }

                contactData.name = name.trim();

                // Continue to email prompt
                this.textPromptModal.show({
                    title: 'Add Contact',
                    message: 'Enter email address (optional):',
                    defaultValue: contactData.email,
                    allowEmpty: true,
                    onOk: (email) => {
                        contactData.email = email.trim();

                        // Continue to role prompt
                        this.textPromptModal.show({
                            title: 'Add Contact',
                            message: 'Enter role/title (optional):',
                            defaultValue: contactData.role,
                            allowEmpty: true,
                            onOk: (role) => {
                                contactData.role = role.trim();

                                // Continue to phone prompt
                                this.textPromptModal.show({
                                    title: 'Add Contact',
                                    message: 'Enter phone number (optional):',
                                    defaultValue: contactData.phone,
                                    allowEmpty: true,
                                    onOk: (phone) => {
                                        contactData.phone = phone.trim();

                                        // Save the contact
                                        this._saveContact(contactData);
                                    },
                                    onCancel: () => {
                                        // User cancelled at phone step - optionally go back to role
                                        console.log('[StageFormRfpMetadata] Contact creation cancelled at phone step');
                                    }
                                });
                            },
                            onCancel: () => {
                                // User cancelled at role step - optionally go back to email
                                console.log('[StageFormRfpMetadata] Contact creation cancelled at role step');
                            }
                        });
                    },
                    onCancel: () => {
                        // User cancelled at email step - optionally go back to name
                        console.log('[StageFormRfpMetadata] Contact creation cancelled at email step');
                    }
                });
            },
            onCancel: () => {
                console.log('[StageFormRfpMetadata] Contact creation cancelled');
            }
        });
    }

    /**
     * Save contact to backend
     * @private
     */
    async _saveContact(contactData) {
        try {
            const projectDocumentId = this._getCleanProjectDocumentId();

            const newContact = await createDocumentItem(
                projectDocumentId,
                this.currentStageId,
                'contacts',
                {
                    contact_name: contactData.name,
                    contact_email: contactData.email,
                    contact_role: contactData.role,
                    contact_phone: contactData.phone,
                    item_type: 'contact'
                }
            );

            this.metadataByGroup.contacts.push(newContact);
            this._renderContactItems();

            // Track successful DocumentItems save
            this._trackDocumentItemSave('create-item', 'success', {
                itemType: 'contact',
                contactName: contactData.name
            });

            this.messageModal.show({
                title: 'Success',
                message: `Contact "${contactData.name}" has been added successfully.`
            });

        } catch (error) {
            console.error('[StageFormRfpMetadata] Error adding contact:', error);

            // Track failed DocumentItems save
            this._trackDocumentItemSave('create-item', 'error', {
                itemType: 'contact',
                contactName: contactData.name,
                error: error.message
            });

            this._showError('Failed to add contact', error.message);
        }
    }

    /**
     * Add new document
     * @private
     */
    async _addDocument() {
        this._promptForDocument({
            name: '',
            url: '',
            description: ''
        });
    }

    /**
     * Prompt for document information using chained modals
     * @private
     */
    _promptForDocument(docData) {
        this.textPromptModal.show({
            title: 'Add Document',
            message: 'Enter the document name:',
            defaultValue: docData.name,
            onOk: (name) => {
                if (!name.trim()) {
                    this._showError('Validation Error', 'Document name is required.');
                    return;
                }

                docData.name = name.trim();

                // Continue to URL prompt
                this.textPromptModal.show({
                    title: 'Add Document',
                    message: 'Enter document URL or path (optional):',
                    defaultValue: docData.url,
                    allowEmpty: true,
                    onOk: (url) => {
                        docData.url = url.trim();

                        // Continue to description prompt
                        this.textPromptModal.show({
                            title: 'Add Document',
                            message: 'Enter description (optional):',
                            defaultValue: docData.description,
                            allowEmpty: true,
                            onOk: (description) => {
                                docData.description = description.trim();

                                // Save the document
                                this._saveDocument(docData);
                            },
                            onCancel: () => {
                                console.log('[StageFormRfpMetadata] Document creation cancelled at description step');
                            }
                        });
                    },
                    onCancel: () => {
                        console.log('[StageFormRfpMetadata] Document creation cancelled at URL step');
                    }
                });
            },
            onCancel: () => {
                console.log('[StageFormRfpMetadata] Document creation cancelled');
            }
        });
    }

    /**
     * Save document to backend
     * @private
     */
    async _saveDocument(docData) {
        try {
            const projectDocumentId = this._getCleanProjectDocumentId();

            const newDoc = await createDocumentItem(
                projectDocumentId,
                this.currentStageId,
                'docs',
                {
                    doc_name: docData.name,
                    doc_url: docData.url,
                    doc_description: docData.description,
                    item_type: 'document'
                }
            );

            this.metadataByGroup.docs.push(newDoc);
            this._renderDocumentItems();

            this.messageModal.show({
                title: 'Success',
                message: `Document "${docData.name}" has been added successfully.`
            });

        } catch (error) {
            console.error('[StageFormRfpMetadata] Error adding document:', error);
            this._showError('Failed to add document', error.message);
        }
    }


    /**
     * Add new team member
     * @private
     */
    async _addTeamMember() {
        this._promptForTeamMember({
            name: '',
            role: '',
            email: ''
        });
    }

    /**
     * Prompt for team member information using chained modals
     * @private
     */
    _promptForTeamMember(memberData) {
        this.textPromptModal.show({
            title: 'Add Team Member',
            message: 'Enter the team member name:',
            defaultValue: memberData.name,
            onOk: (name) => {
                if (!name.trim()) {
                    this._showError('Validation Error', 'Team member name is required.');
                    return;
                }

                memberData.name = name.trim();

                // Continue to role prompt
                this.textPromptModal.show({
                    title: 'Add Team Member',
                    message: 'Enter role/responsibility (optional):',
                    defaultValue: memberData.role,
                    allowEmpty: true,
                    onOk: (role) => {
                        memberData.role = role.trim();

                        // Continue to email prompt
                        this.textPromptModal.show({
                            title: 'Add Team Member',
                            message: 'Enter email address (optional):',
                            defaultValue: memberData.email,
                            allowEmpty: true,
                            onOk: (email) => {
                                memberData.email = email.trim();

                                // Save the team member
                                this._saveTeamMember(memberData);
                            },
                            onCancel: () => {
                                console.log('[StageFormRfpMetadata] Team member creation cancelled at email step');
                            }
                        });
                    },
                    onCancel: () => {
                        console.log('[StageFormRfpMetadata] Team member creation cancelled at role step');
                    }
                });
            },
            onCancel: () => {
                console.log('[StageFormRfpMetadata] Team member creation cancelled');
            }
        });
    }

    /**
     * Save team member to backend
     * @private
     */
    async _saveTeamMember(memberData) {
        try {
            const projectDocumentId = this._getCleanProjectDocumentId();

            const newMember = await createDocumentItem(
                projectDocumentId,
                this.currentStageId,
                'team',
                {
                    member_name: memberData.name,
                    member_role: memberData.role,
                    member_email: memberData.email,
                    item_type: 'team_member'
                }
            );

            this.metadataByGroup.team.push(newMember);
            this._renderTeamItems();

            this.messageModal.show({
                title: 'Success',
                message: `Team member "${memberData.name}" has been added successfully.`
            });

        } catch (error) {
            console.error('[StageFormRfpMetadata] Error adding team member:', error);
            this._showError('Failed to add team member', error.message);
        }
    }

    /**
     * Render contact items
     * @private
     */
    _renderContactItems() {
        const container = document.getElementById('contacts-list');
        if (!container) return;

        if (this.metadataByGroup.contacts.length === 0) {
            container.innerHTML = '<div class="rm-list-empty">No contacts added yet.</div>';
            return;
        }

        const itemsList = document.createElement('ul');
        itemsList.className = 'rm-list-items';

        this.metadataByGroup.contacts.forEach(contact => {
            const listItem = document.createElement('li');
            listItem.className = 'rm-list-item';

            const content = document.createElement('div');
            content.className = 'rm-list-item-content';

            const primary = document.createElement('div');
            primary.className = 'rm-list-item-primary';
            primary.textContent = `${contact.contact_name} - ${contact.contact_role}`;

            const secondary = document.createElement('div');
            secondary.className = 'rm-list-item-secondary';
            secondary.textContent = `${contact.contact_email} ${contact.contact_phone}`.trim();

            content.appendChild(primary);
            content.appendChild(secondary);

            const actions = document.createElement('div');
            actions.className = 'rm-list-item-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'rm-item-btn rm-item-btn--danger';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener('click', () => this._deleteItem('contacts', contact));

            actions.appendChild(deleteBtn);

            listItem.appendChild(content);
            listItem.appendChild(actions);
            itemsList.appendChild(listItem);
        });

        container.innerHTML = '';
        container.appendChild(itemsList);
    }

    /**
     * Render document items
     * @private
     */
    _renderDocumentItems() {
        const container = document.getElementById('docs-list');
        if (!container) return;

        if (this.metadataByGroup.docs.length === 0) {
            container.innerHTML = '<div class="rm-list-empty">No documents added yet.</div>';
            return;
        }

        const itemsList = document.createElement('ul');
        itemsList.className = 'rm-list-items';

        this.metadataByGroup.docs.forEach(doc => {
            const listItem = document.createElement('li');
            listItem.className = 'rm-list-item';

            const content = document.createElement('div');
            content.className = 'rm-list-item-content';

            const primary = document.createElement('div');
            primary.className = 'rm-list-item-primary';

            if (doc.doc_url) {
                const link = document.createElement('a');
                link.href = doc.doc_url;
                link.target = '_blank';
                link.textContent = doc.doc_name;
                link.style.color = 'var(--interactive-primary)';
                primary.appendChild(link);
            } else {
                primary.textContent = doc.doc_name;
            }

            const secondary = document.createElement('div');
            secondary.className = 'rm-list-item-secondary';
            secondary.textContent = doc.doc_description || doc.doc_url || '';

            content.appendChild(primary);
            content.appendChild(secondary);

            const actions = document.createElement('div');
            actions.className = 'rm-list-item-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'rm-item-btn rm-item-btn--danger';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener('click', () => this._deleteItem('docs', doc));

            actions.appendChild(deleteBtn);

            listItem.appendChild(content);
            listItem.appendChild(actions);
            itemsList.appendChild(listItem);
        });

        container.innerHTML = '';
        container.appendChild(itemsList);
    }

    /**
     * Render team items
     * @private
     */
    _renderTeamItems() {
        const container = document.getElementById('team-list');
        if (!container) return;

        if (this.metadataByGroup.team.length === 0) {
            container.innerHTML = '<div class="rm-list-empty">No team members added yet.</div>';
            return;
        }

        const itemsList = document.createElement('ul');
        itemsList.className = 'rm-list-items';

        this.metadataByGroup.team.forEach(member => {
            const listItem = document.createElement('li');
            listItem.className = 'rm-list-item';

            const content = document.createElement('div');
            content.className = 'rm-list-item-content';

            const primary = document.createElement('div');
            primary.className = 'rm-list-item-primary';
            primary.textContent = `${member.member_name} - ${member.member_role}`;

            const secondary = document.createElement('div');
            secondary.className = 'rm-list-item-secondary';
            secondary.textContent = member.member_email || '';

            content.appendChild(primary);
            content.appendChild(secondary);

            const actions = document.createElement('div');
            actions.className = 'rm-list-item-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'rm-item-btn rm-item-btn--danger';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener('click', () => this._deleteItem('team', member));

            actions.appendChild(deleteBtn);

            listItem.appendChild(content);
            listItem.appendChild(actions);
            itemsList.appendChild(listItem);
        });

        container.innerHTML = '';
        container.appendChild(itemsList);
    }

    /**
     * Delete an item
     * @private
     */
    async _deleteItem(groupId, item) {
        // Get the item name and type for confirmation
        let itemName = '';
        let itemType = '';

        if (groupId === 'contacts') {
            itemName = item.contact_name;
            itemType = 'contact';
        } else if (groupId === 'docs') {
            itemName = item.doc_name;
            itemType = 'document';
        } else if (groupId === 'team') {
            itemName = item.member_name;
            itemType = 'team member';
        } else {
            itemName = 'this item';
            itemType = 'item';
        }

        this.yesNoModal.show({
            title: 'Confirm Deletion',
            message: `Are you sure you want to delete the ${itemType} "${itemName}"? This action cannot be undone.`,
            yesText: 'Delete',
            noText: 'Cancel',
            onYes: async () => {
                try {
                    const projectDocumentId = this._getCleanProjectDocumentId();

                    await bulkDeleteDocumentItems(
                        projectDocumentId,
                        this.currentStageId,
                        groupId,
                        [item.project_document_stage_group_id_item_id]
                    );

                    // Remove from local cache
                    this.metadataByGroup[groupId] = this.metadataByGroup[groupId].filter(
                        i => i.project_document_stage_group_id_item_id !== item.project_document_stage_group_id_item_id
                    );

                    // Re-render the appropriate list
                    if (groupId === 'contacts') this._renderContactItems();
                    else if (groupId === 'docs') this._renderDocumentItems();
                    else if (groupId === 'team') this._renderTeamItems();

                    // Show success message
                    this.messageModal.show({
                        title: 'Deleted Successfully',
                        message: `The ${itemType} "${itemName}" has been deleted.`
                    });

                } catch (error) {
                    console.error('[StageFormRfpMetadata] Error deleting item:', error);
                    this._showError('Failed to delete item', error.message);
                }
            },
            onNo: () => {
                console.log('[StageFormRfpMetadata] Deletion cancelled by user');
            }
        });
    }

    /**
     * Get clean project document ID (without subtenant prefix)
     * @private
     */
    _getCleanProjectDocumentId() {
        // The docTaskInstance should contain the clean project document ID
        return `${this.docTaskInstance.projectId}#${this.docTaskInstance.documentId}`;
    }

    /**
     * Get issuing organization from project
     * @private
     */
    _getIssuingOrganization() {
        // Extract from projectId which is in format "accountId#projectId"
        return this.docTaskInstance.projectId || 'Unknown Organization';
    }

    /**
     * Show error message
     * @private
     */
    _showError(title, message) {
        this.errorModal.show({
            title: title,
            message: message
        });
    }

    /**
     * Get stage data for saving
     */
    getSaveData() {
        // Return current metadata organized by groups
        return {
            [this.currentStageId]: {
                status: 'IN_PROGRESS',
                metadata: this.metadataByGroup
            }
        };
    }

    /**
     * Load stage data
     */
    loadData(data) {
        if (data && data[this.currentStageId]) {
            console.log(`[StageFormRfpMetadata] Loading data for stage ${this.currentStageId}`);
            // Data will be loaded via _loadMetadata() instead
        }
    }
}