// File: ui/views/tab.js
/**
 * A single Tab object: holds title, doc instance, etc.
 */
export class Tab {
  constructor({ id, title, iconClass, color, documentInstance }) {
    this.id = id || ("tab_" + Math.random().toString(36).slice(2));
    this.title = title || "Untitled";
    this.iconClass = iconClass || "fas fa-question-circle";
    this.color = color || "default-color";
    this.documentInstance = documentInstance || null;
  }
}
