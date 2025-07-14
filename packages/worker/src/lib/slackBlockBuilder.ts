export class SlackBlockBuilder {
  static metricResponse(metric: string, value: string | number, change?: string): any {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${metric}* :chart_with_upwards_trend:`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> *${value}*${change ? `\n> _Change: ${change}_` : ''}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Data refreshed at ${new Date().toLocaleString()}`
          }
        ]
      }
    ];
    
    return { blocks };
  }
  
  static actionableResponse(
    title: string,
    description: string,
    reasoning: string,
    actions: Array<{ text: string, value: string, style?: string }>
  ): any {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: title
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: description
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'image',
            image_url: 'https://a.slack-edge.com/80588/img/slackbot_32.png',
            alt_text: 'brain'
          },
          {
            type: 'mrkdwn',
            text: `*My Reasoning:* ${reasoning}`
          }
        ]
      },
      {
        type: 'actions',
        elements: actions.map(action => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: action.text,
            emoji: true
          },
          style: action.style,
          value: action.value,
          action_id: `action_${action.value.split(':')[1]}`
        }))
      }
    ];
    
    return { blocks };
  }
  
  static errorResponse(error: string): any {
    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':x: An error occurred'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `\`\`\`${error}\`\`\``
          }
        }
      ]
    };
  }
}