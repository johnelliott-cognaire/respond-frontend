// ui/modals/user-modal.js
export class UserModal {
    _buildDOM() {
      this.modalEl = document.createElement("div");
      this.modalEl.classList.add("modal", "form-modal", "user-modal");
      this.modalEl.style.maxHeight = "95vh";
      this.modalEl.style.overflowY = "auto";
  
      this.modalEl.innerHTML = `
        <button class="modal__close" aria-label="Close" id="closeUserModalBtn">
          &times;
        </button>
        <h2 id="umTitleH2">User Details</h2>
  
        <div class="form-group">
          <label>Username</label>
          <input type="text" class="doc-input" id="umUsernameField" />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="text" class="doc-input" id="umEmailField" />
        </div>
  
        <div class="form-group" id="umSystemPermsWrapper">
          <label>
            System Permissions
            <span class="info-icon">ⓘ</span>
          </label>
          <div id="umSystemPermsContainer" style="display:flex; flex-wrap:wrap; gap:8px;">
            <!-- permission checkboxes -->
          </div>
        </div>
  
        <div class="form-group">
          <label>
            Account Permissions
            <span class="info-icon">ⓘ</span>
          </label>
          <div id="umAccountsList"
               style="border:1px solid var(--border-subtle);
                      padding:0.5rem;
                      max-height:100px;
                      overflow-y:auto;">
            <!-- account items -->
          </div>
          <button class="btn btn--secondary" id="umAddAccountBtn">
            Add Account Permission
          </button>
        </div>
  
        <!-- similar blocks for projects, corpus, docchain -->
  
        <div class="button-group" style="margin-top:1rem;">
          <button class="btn" id="umEditBtn">Edit</button>
          <button class="btn btn--primary" id="umSaveChangesBtn">Save Changes</button>
          <button class="btn btn--secondary" id="umDuplicatePermsBtn">
            Duplicate Permissions
          </button>
        </div>
      `;
  
      document.body.appendChild(this.modalEl);
    }
  }
  