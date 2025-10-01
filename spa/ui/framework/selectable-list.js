// ui/framework/selectable-list.js
/**
 * A simple UI component for displaying a list of items with single selection.
 * Usage:
 *   const list = new SelectableList();
 *   list.setItems([{ id: '1', label: 'Doc 1' }, { id: '2', label: 'Doc 2' }]);
 *   list.onSelectionChange = (selectedItem) => { ... };
 *   containerEl.appendChild(list.render());
 */
export class SelectableList {
  constructor() {
    this.items = [];
    this.selectedItemId = null;
    this.onSelectionChange = null;

    // For the main container element
    this.rootEl = document.createElement("div");
    this.rootEl.className = "selectable-list";
    // We'll handle item clicks with a single event listener
    this.rootEl.addEventListener("click", (e) => this.handleItemClick(e));
  }

  setItems(items) {
    // items is an array of objects: { id, label, ... }
    this.items = items;
    // Clear selection if item is no longer in the list
    if (this.selectedItemId && !this.items.find(i => i.id === this.selectedItemId)) {
      this.selectedItemId = null;
    }
    this.renderList();
  }

  getSelectedItem() {
    return this.items.find(i => i.id === this.selectedItemId) || null;
  }

  handleItemClick(e) {
    const li = e.target.closest(".selectable-list-item");
    if (!li) return;
    const clickedId = li.dataset.itemId;
    if (clickedId === this.selectedItemId) {
      // Toggle off if you want to allow "no selection"
      // Or keep it always selected. We'll just keep single selection locked in.
      return;
    }
    this.selectedItemId = clickedId;
    this.renderList();
    if (typeof this.onSelectionChange === "function") {
      this.onSelectionChange(this.getSelectedItem());
    }
  }

  renderList() {
    this.rootEl.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "selectable-list-container";
    for (const item of this.items) {
      const li = document.createElement("li");
      li.className = "selectable-list-item";
      li.dataset.itemId = item.id;
      li.textContent = item.label;
      if (this.selectedItemId === item.id) {
        li.classList.add("selected");
      }
      ul.appendChild(li);
    }
    this.rootEl.appendChild(ul);
    return this.rootEl;
  }

  render() {
    // If it's the first time, just build an empty container and
    // call renderList() to fill it.
    return this.renderList();
  }
}
