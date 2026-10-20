import {
  AbstractMessageAction,
  MessageType,
  type Message,
  type MessageDescription,
} from "jimu-core"
import { handleSelectionMessageForWidget } from "../runtime/utils/selectionMessageBus"

export default class UnifiedSelectionAction extends AbstractMessageAction {
  filterMessageDescription(description: MessageDescription): boolean {
    return description.messageType === MessageType.DataRecordsSelectionChange
  }

  filterMessage(message: Message): boolean {
    return message.type === MessageType.DataRecordsSelectionChange
  }

  // No action settings: all external widgets use spatial intersection.
  getSettingComponentUri() {
    return null
  }

  async onExecute(message: Message): Promise<boolean> {
    return handleSelectionMessageForWidget(this.widgetId, message)
  }
}
