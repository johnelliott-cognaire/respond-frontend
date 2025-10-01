// ui/modals/modal-selection.js
/**
 * SelectionModeConfig
 * Base interface for controlling selection mode in list-based modals.
 *
 * Fields:
 *   selectionMode: boolean     // if true, we show "Select" button, etc.
 *   onSelect: function(selectedItemOrItems)
 *   allowMultiple: boolean     // single or multiple selection
 *   filterCallback: function(item): boolean // optional callback to filter items
 */

export const SelectionModeConfig = {
  selectionMode: false,
  onSelect: null,
  allowMultiple: false,
  filterCallback: null
};
