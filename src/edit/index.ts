export { removeAttribute, setAttribute } from "./attributes";
export { classifyEdit, type EditClassification, type EditKind } from "./classify";
export { replaceElement, replaceElementInner } from "./element";
export { EditError, type EditErrorCode } from "./errors";
export {
  applyEdits,
  composeChanges,
  isNoopChange,
  replaceFile,
  replaceRange,
  type EditResult,
  type MultiEditResult,
  type RangeEdit,
} from "./textChange";
