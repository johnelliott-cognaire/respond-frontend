// ui/components/text-editor.js
export class TextEditor {
    /**
     * @param {Object} options Configuration options
     * @param {HTMLElement} options.container Container element
     * @param {string} options.documentType Document extension (md, txt, html)
     * @param {string} options.content Initial content
     * @param {boolean} options.readOnly Whether editor is in read-only mode
     * @param {Function} options.onChange Callback when content changes
     */
    constructor(options) {
      this.container = options.container;
      this.documentType = options.documentType || 'txt';
      this.content = options.content || '';
      this.readOnly = options.readOnly || false;
      this.onChange = options.onChange || (() => {});
      
      this.editor = null;
      this.editorEl = null;
      
      this.render();
    }
    
    render() {
      if (!this.container) return;
      
      // Create editor element
      this.editorEl = document.createElement('div');
      this.editorEl.className = 'text-editor';
      this.container.appendChild(this.editorEl);
      
      // Initialize appropriate editor based on document type
      if (['md', 'markdown'].includes(this.documentType.toLowerCase())) {
        this.initMarkdownEditor();
      } else if (['html', 'htm'].includes(this.documentType.toLowerCase())) {
        this.initHtmlEditor();
      } else {
        // Default to plain text editor
        this.initPlainTextEditor();
      }
    }
    
    initMarkdownEditor() {
      // Create EasyMDE instance
      const textarea = document.createElement('textarea');
      this.editorEl.appendChild(textarea);
      
      if (window.EasyMDE) {
        this.editor = new window.EasyMDE({
          element: textarea,
          initialValue: this.content,
          readOnly: this.readOnly,
          toolbar: [
            'bold', 'italic', 'heading', '|',
            'quote', 'unordered-list', 'ordered-list', '|',
            'link', 'image', 'table', '|',
            'preview', 'side-by-side', 'fullscreen', '|',
            'guide'
          ],
          spellChecker: false,
          status: ['lines', 'words', 'cursor'],
          autofocus: true
        });
        
        // Add change event listener
        this.editor.codemirror.on('change', () => {
          this.onChange(this.editor.value());
        });
      } else {
        console.error('EasyMDE not loaded. Falling back to plain textarea.');
        this.initPlainTextEditor();
      }
    }
    
    initHtmlEditor() {
        const container = document.createElement('div');
        container.className = 'html-editor-container';
        container.style.height = '100%';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        
        // Add a simple toolbar for HTML editing
        if (!this.readOnly) {
          const toolbar = document.createElement('div');
          toolbar.className = 'html-editor-toolbar';
          
          // Add common HTML tags as buttons (keep your existing tools)
          const tools = [
            { name: 'p', title: 'Paragraph', tag: '<p></p>' },
            { name: 'h1', title: 'Heading 1', tag: '<h1></h1>' },
            { name: 'h2', title: 'Heading 2', tag: '<h2></h2>' },
            { name: 'h3', title: 'Heading 3', tag: '<h3></h3>' },
            { name: 'b', title: 'Bold', tag: '<strong></strong>' },
            { name: 'i', title: 'Italic', tag: '<em></em>' },
            { name: 'a', title: 'Link', tag: '<a href=""></a>' },
            { name: 'ul', title: 'Unordered List', tag: '<ul>\n  <li></li>\n</ul>' },
            { name: 'ol', title: 'Ordered List', tag: '<ol>\n  <li></li>\n</ol>' },
            { name: 'img', title: 'Image', tag: '<img src="" alt="">' },
            { name: 'div', title: 'Div', tag: '<div></div>' },
            { name: 'span', title: 'Span', tag: '<span></span>' },
            { name: 'table', title: 'Table', tag: '<table>\n  <tr>\n    <td></td>\n  </tr>\n</table>' }
          ];
          
          tools.forEach(tool => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'html-tool-btn';
            button.textContent = tool.name;
            button.title = tool.title;
            
            button.addEventListener('click', () => {
              this.insertHtmlTag(tool.tag);
            });
            
            toolbar.appendChild(button);
          });
          
          container.appendChild(toolbar);
        }
        
        // Create a wrapper for the textarea with proper size constraints
        const editorWrapper = document.createElement('div');
        editorWrapper.style.flex = '1';
        editorWrapper.style.position = 'relative';
        editorWrapper.style.overflow = 'hidden';
        
        // Create the textarea with styles that ensure scrolling works
        const textarea = document.createElement('textarea');
        textarea.className = 'html-editor';
        textarea.value = this.content;
        textarea.readOnly = this.readOnly;
        textarea.spellcheck = false;
        
        // Critical styles for scrolling to work
        textarea.style.position = 'absolute';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.style.boxSizing = 'border-box';
        textarea.style.padding = '12px';
        textarea.style.resize = 'none';
        textarea.style.overflow = 'auto';
        
        editorWrapper.appendChild(textarea);
        container.appendChild(editorWrapper);
        this.editorEl.appendChild(container);
        
        // Add change event listener
        if (!this.readOnly) {
          textarea.addEventListener('input', () => {
            this.onChange(textarea.value);
          });
        }
        
        this.editor = textarea;
      }
    
    /* This is used for HTML editing, not TXT editing */
    initPlainTextEditor() {
      const textarea = document.createElement('textarea');
      textarea.className = 'plain-text-editor';
      textarea.value = this.content;
      textarea.readOnly = this.readOnly;
      textarea.rows = 20;
      textarea.style.width = '100%';
      textarea.style.fontFamily = 'monospace';
      this.editorEl.appendChild(textarea);
      
      // Add change event listener
      textarea.addEventListener('input', () => {
        this.onChange(textarea.value);
      });
      
      this.editor = textarea;
    }
    
    getValue() {
      if (this.editor instanceof window.EasyMDE) {
        return this.editor.value();
      } else if (this.editor instanceof HTMLTextAreaElement) {
        return this.editor.value;
      }
      return this.content;
    }
    
    setValue(content) {
      this.content = content;
      
      if (this.editor instanceof window.EasyMDE) {
        this.editor.value(content);
      } else if (this.editor instanceof HTMLTextAreaElement) {
        this.editor.value = content;
      }
    }
    
    focus() {
      if (this.editor instanceof window.EasyMDE) {
        this.editor.codemirror.focus();
      } else if (this.editor instanceof HTMLTextAreaElement) {
        this.editor.focus();
      }
    }
    
    destroy() {
      if (this.editor instanceof window.EasyMDE) {
        this.editor.toTextArea();
        this.editor = null;
      }
      
      if (this.editorEl && this.editorEl.parentElement) {
        this.editorEl.parentElement.removeChild(this.editorEl);
      }
    }
  }