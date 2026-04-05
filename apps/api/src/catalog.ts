import type { ConnectorDefinition } from './types.js';

const runtimeOnlyKeys: Partial<Record<ConnectorDefinition['type'], string[]>> = {
  discordWebhook: ['webhookUrl'],
  gmailSmtp: ['user', 'pass', 'from', 'to']
};

export const connectorCatalog: ConnectorDefinition[] = [
  {
    type: 'manualTrigger',
    label: 'Manual Trigger',
    accent: '#ff7a00',
    description: 'Inicia la automatizacion con un payload manual.',
    defaults: {
      note: 'Usa el panel Run para enviar el payload inicial.'
    },
    fields: [
      {
        key: 'note',
        label: 'Nota',
        type: 'textarea',
        placeholder: 'Describe que dispara este workflow'
      }
    ]
  },
  {
    type: 'transform',
    label: 'Transform',
    accent: '#1565c0',
    description: 'Crea un payload nuevo con variables interpoladas.',
    defaults: {
      template: '{\n  "message": "Hola ${input.name}",\n  "email": "${input.email}"\n}'
    },
    fields: [
      {
        key: 'template',
        label: 'Template JSON',
        type: 'textarea',
        placeholder: '{"message":"${input.name}"}'
      }
    ]
  },
  {
    type: 'wait',
    label: 'Wait',
    accent: '#6d4c41',
    description: 'Pausa el flujo una cantidad de milisegundos.',
    defaults: {
      milliseconds: 1000
    },
    fields: [
      {
        key: 'milliseconds',
        label: 'Milisegundos',
        type: 'number',
        placeholder: '1000'
      }
    ]
  },
  {
    type: 'httpRequest',
    label: 'HTTP Request',
    accent: '#00897b',
    description: 'Llama cualquier API REST con metodo, headers y body.',
    defaults: {
      method: 'POST',
      url: 'https://httpbin.org/post',
      headers: '{\n  "Content-Type": "application/json"\n}',
      body: '{\n  "lead": "${input.name}"\n}'
    },
    fields: [
      {
        key: 'method',
        label: 'Metodo',
        type: 'select',
        options: [
          { "label": "GET", "value": "GET" },
          { "label": "POST", "value": "POST" },
          { "label": "PUT", "value": "PUT" },
          { "label": "PATCH", "value": "PATCH" },
          { "label": "DELETE", "value": "DELETE" }
        ]
      },
      {
        key: 'url',
        label: 'URL',
        type: 'text',
        placeholder: 'https://api.example.com'
      },
      {
        key: 'headers',
        label: 'Headers JSON',
        type: 'textarea',
        placeholder: '{"Authorization":"Bearer ..."}'
      },
      {
        key: 'body',
        label: 'Body JSON',
        type: 'textarea',
        placeholder: '{"message":"${input.name}"}'
      }
    ]
  },
  {
    type: 'discordWebhook',
    label: 'Discord Webhook',
    accent: '#5865f2',
    description: 'Publica mensajes en Discord mediante un webhook.',
    defaults: {
      webhookUrl: '',
      username: 'Mini n8n Bot',
      content: 'Nuevo evento desde ${input.name}'
    },
    fields: [
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'password',
        placeholder: 'https://discord.com/api/webhooks/...',
        runtimeOnly: true
      },
      {
        key: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Mini n8n Bot'
      },
      {
        key: 'content',
        label: 'Mensaje',
        type: 'textarea',
        placeholder: 'Nuevo lead: ${input.name}'
      }
    ]
  },
  {
    type: 'gmailSmtp',
    label: 'Gmail SMTP',
    accent: '#db4437',
    description: 'Envia correos via SMTP; sirve con Gmail usando app password.',
    defaults: {
      host: 'smtp.gmail.com',
      port: 465,
      secure: 'true',
      user: '',
      pass: '',
      from: '',
      to: '',
      subject: 'Nuevo evento para ${input.name}',
      html: '<strong>Hola ${input.name}</strong>'
    },
    fields: [
      {
        key: 'host',
        label: 'Host SMTP',
        type: 'text',
        placeholder: 'smtp.gmail.com'
      },
      {
        key: 'port',
        label: 'Puerto',
        type: 'number',
        placeholder: '465'
      },
      {
        key: 'secure',
        label: 'SSL',
        type: 'select',
        options: [
          { "label": "true", "value": "true" },
          { "label": "false", "value": "false" }
        ]
      },
      {
        key: 'user',
        label: 'Usuario',
        type: 'text',
        placeholder: 'tu@gmail.com',
        runtimeOnly: true
      },
      {
        key: 'pass',
        label: 'App Password',
        type: 'password',
        placeholder: 'xxxx xxxx xxxx xxxx',
        runtimeOnly: true
      },
      {
        key: 'from',
        label: 'From',
        type: 'text',
        placeholder: 'tu@gmail.com',
        runtimeOnly: true
      },
      {
        key: 'to',
        label: 'To',
        type: 'text',
        placeholder: 'cliente@correo.com',
        runtimeOnly: true
      },
      {
        key: 'subject',
        label: 'Subject',
        type: 'text',
        placeholder: 'Nuevo evento'
      },
      {
        key: 'html',
        label: 'HTML',
        type: 'textarea',
        placeholder: '<strong>Hola</strong>'
      }
    ]
  }
];

export const connectorMap = new Map(connectorCatalog.map((connector) => [connector.type, connector]));

export function getRuntimeOnlyKeys(type: ConnectorDefinition['type']) {
  return runtimeOnlyKeys[type] ?? [];
}
