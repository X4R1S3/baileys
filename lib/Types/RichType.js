/**
 * @X4R1S3
 *
 * File: lib/Types/RichType.js
 * About: RichType module for the X4R1S3 WhatsApp protocol client.
 * Important exports: CodeHighlightType, RichSubMessageType
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
export var CodeHighlightType;
(function (CodeHighlightType) {
    CodeHighlightType[CodeHighlightType["DEFAULT"] = 0] = "DEFAULT";
    CodeHighlightType[CodeHighlightType["KEYWORD"] = 1] = "KEYWORD";
    CodeHighlightType[CodeHighlightType["METHOD"] = 2] = "METHOD";
    CodeHighlightType[CodeHighlightType["STRING"] = 3] = "STRING";
    CodeHighlightType[CodeHighlightType["NUMBER"] = 4] = "NUMBER";
    CodeHighlightType[CodeHighlightType["COMMENT"] = 5] = "COMMENT";
})(CodeHighlightType || (CodeHighlightType = {}));
export var RichSubMessageType;
(function (RichSubMessageType) {
    RichSubMessageType[RichSubMessageType["UNKNOWN"] = 0] = "UNKNOWN";
    RichSubMessageType[RichSubMessageType["GRID_IMAGE"] = 1] = "GRID_IMAGE";
    RichSubMessageType[RichSubMessageType["TEXT"] = 2] = "TEXT";
    RichSubMessageType[RichSubMessageType["INLINE_IMAGE"] = 3] = "INLINE_IMAGE";
    RichSubMessageType[RichSubMessageType["TABLE"] = 4] = "TABLE";
    RichSubMessageType[RichSubMessageType["CODE"] = 5] = "CODE";
    RichSubMessageType[RichSubMessageType["DYNAMIC"] = 6] = "DYNAMIC";
    RichSubMessageType[RichSubMessageType["MAP"] = 7] = "MAP";
    RichSubMessageType[RichSubMessageType["LATEX"] = 8] = "LATEX";
    RichSubMessageType[RichSubMessageType["CONTENT_ITEMS"] = 9] = "CONTENT_ITEMS";
})(RichSubMessageType || (RichSubMessageType = {}));