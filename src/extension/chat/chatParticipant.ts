import {
  CancellationToken,
  chat,
  lm,
  ChatContext,
  ChatRequest,
  ChatRequestHandler,
  ChatResponseStream,
  ChatResult,
  LanguageModelChatSelector,
  LanguageModelChatMessage
} from 'vscode';
import { ClusterNode, getConnections } from '../activityBar/treeData';
import { fromConnectionInfo } from '../kusto/connections';

const CHAT_PARTICIPANT_ID = `vscode-kusto.kusto`;
const MODEL_SELECTOR: LanguageModelChatSelector = { vendor: 'copilot', family: 'gpt-4' };

export function registerChatParticipant() {
  const handler: ChatRequestHandler = async (
    request: ChatRequest,
    context: ChatContext,
    stream: ChatResponseStream,
    token: CancellationToken
  ): Promise<ChatResult> => {
    const [model] = await lm.selectChatModels(MODEL_SELECTOR);
    if (!model) {
      throw Error('No model access');
    }

    const connections = getConnections();
    for (const connection of connections) {
      const schema = await fromConnectionInfo(connection.info).getSchema({ ignoreCache: true });
      connection.updateSchema(schema);
    }

    const summary = createTableSummary(connections, 'help', 'ContosoSales', 'SalesFact');

    const messages = [
      LanguageModelChatMessage.User(
        `You are an AI assistant who helps anser questions about Kusto. You will be provided some metadata about the Kusto tables the user has access to and the user's query. You should provide a response that helps the user understand the data better.`
      )
    ];
    

    if (summary) {
      messages.push(LanguageModelChatMessage.User(`I have the following table:\n${summary}`));
    }

    messages.push(LanguageModelChatMessage.User(request.prompt));

    const response = await model.sendRequest(messages, {}, token);
    for await (const fragment of response.text) {
      stream.markdown(fragment);
    }

    return { metadata: {} };
  };

  chat.createChatParticipant(CHAT_PARTICIPANT_ID, handler);
}

function createTableSummary(connections: ClusterNode[], clusterName: string, databaseName: string, tableName: string) {
  const connection = connections.find((item) => item.info.displayName === clusterName);
  if (!connection) {
    return undefined;
  }

  const database = connection.schema.cluster.databases.find((item) => item.name === databaseName);
  if (!database) {
    return undefined;
  }

  const table = database.tables.find((item) => item.name === tableName);
  if (!table) {
    return undefined;
  }

  let summary = '';
  summary += `Cluster: ${clusterName}\n`;
  summary += `Database: ${databaseName}\n`;
  summary += `Table: ${tableName}\n`;
  summary += `Columns: ${table.columns.length}\n`;
  for (const column of table.columns) {
    summary += `  - ${column.name}: ${column.type}\n`;
  }
}
