/**
 * @X4R1S3
 *
 * File: lib/Types/Message.js
 * About: Message module for the X4R1S3 WhatsApp protocol client.
 * Important exports: AssociationType, ButtonHeaderType, ButtonType, CarouselCardType, ListType, ProtocolType, EventInviteStatus, WAMessageStubType; …
 * Directions: Import the listed exports and preserve protocol, validation, and compatibility invariants when modifying.
 *
 * Copyright and attribution notice.
 * Do not copy, reproduce, redistribute, modify, or create derivative works
 * from this source without explicit written permission.
 */
import { proto } from '../../WAProto/index.js';
// export the WAMessage Prototypes
export { proto as WAProto };
// Lia@Changes 03-02-26 --- Add exported message-related enum types from proto.Message
export const AssociationType = proto.MessageAssociation.AssociationType;
export const ButtonHeaderType = proto.Message.ButtonsMessage.HeaderType;
export const ButtonType = proto.Message.ButtonsMessage.Button.Type;
export const CarouselCardType = proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType;
export const ListType = proto.Message.ListMessage.ListType;
export const ProtocolType = proto.Message.ProtocolMessage.Type;
export const EventInviteStatus = proto.Message.EventInviteMessage.EventStatus;
export const WAMessageStubType = proto.WebMessageInfo.StubType;
export const WAMessageStatus = proto.WebMessageInfo.Status;
export var WAMessageAddressingMode;
(function (WAMessageAddressingMode) {
    WAMessageAddressingMode["PN"] = "pn";
    WAMessageAddressingMode["LID"] = "lid";
})(WAMessageAddressingMode || (WAMessageAddressingMode = {}));
