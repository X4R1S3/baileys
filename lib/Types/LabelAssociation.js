/**
 * @X4R1S3
 *
 * File: lib/Types/LabelAssociation.js
 * About: LabelAssociation module for the X4R1S3 WhatsApp protocol client.
 * Important exports: LabelAssociationType
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
/** Association type */
export var LabelAssociationType;
(function (LabelAssociationType) {
    LabelAssociationType["Chat"] = "label_jid";
    LabelAssociationType["Message"] = "label_message";
})(LabelAssociationType || (LabelAssociationType = {}));