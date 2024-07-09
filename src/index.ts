import * as core from '@actions/core'
import { App, BlockAction, LogLevel } from '@slack/bolt'
import { Block, WebClient } from '@slack/web-api'
import { randomUUID } from 'crypto'

const token = process.env.SLACK_BOT_TOKEN || ""
const signingSecret =  process.env.SLACK_SIGNING_SECRET || ""
const slackAppToken = process.env.SLACK_APP_TOKEN || ""
const channel_id    = process.env.SLACK_CHANNEL_ID || ""

const app = new App({
  token: token,
  signingSecret: signingSecret,
  appToken: slackAppToken,
  socketMode: true,
  port: 3000,
  logLevel: LogLevel.DEBUG,
});

async function run(): Promise<void> {
  const web = new WebClient(token);

  const github_server_url = process.env.GITHUB_SERVER_URL || "";
  const github_repos = process.env.GITHUB_REPOSITORY || "";
  const run_id = process.env.GITHUB_RUN_ID || "";
  const actionsUrl = `${github_server_url}/${github_repos}/actions/runs/${run_id}`;
  const workflow   = process.env.GITHUB_WORKFLOW || "";
  const runnerOS   = process.env.RUNNER_OS || "";
  const actor      = process.env.GITHUB_ACTOR || "";

  const blocks: Array<Block> = core.getInput('blocks') ?
    JSON.parse(core.getInput('blocks')) :
    [
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": `*GitHub Actor:*\n${actor}`
          },
          {
            "type": "mrkdwn",
            "text": `*Repos:*\n${github_server_url}/${github_repos}`
          },
          {
            "type": "mrkdwn",
            "text": `*Actions URL:*\n${actionsUrl}`
          },
          {
            "type": "mrkdwn",
            "text": `*GITHUB_RUN_ID:*\n${run_id}`
          },
          {
            "type": "mrkdwn",
            "text": `*Workflow:*\n${workflow}`
          },
          {
            "type": "mrkdwn",
            "text": `*RunnerOS:*\n${runnerOS}`
          }
        ]
      }
    ];

  const actionId = randomUUID();

  await web.chat.postMessage({
    channel: channel_id,
    text: "GitHub Actions Approval request",
    blocks: [
        {
          "type": "section",
          "text": {
              "type": "mrkdwn",
              "text": `GitHub Actions Approval Request`,
            }
        },
        ...blocks,
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "emoji": true,
                        "text": "Approve"
                    },
                    "style": "primary",
                    "value": "approve",
                    "action_id": `slack-approval-approve-${actionId}`
                },
                {
                    "type": "button",
                    "text": {
                            "type": "plain_text",
                            "emoji": true,
                            "text": "Reject"
                    },
                    "style": "danger",
                    "value": "reject",
                    "action_id": `slack-approval-reject-${actionId}`
                }
            ]
        }
    ]
  });

  app.action(`slack-approval-approve-${actionId}`, async ({ack, client, body, logger}) => {
    try {
      core.info('Acking…')
      await ack();
      core.info('Acked.')

      const response_blocks = (<BlockAction>body).message?.blocks
      response_blocks.pop()
      response_blocks.push({
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': `Approved by <@${body.user.id}> `,
        },
      })

      core.info('Updating message…')
      await client.chat.update({
        channel: body.channel?.id || "",
        ts: (<BlockAction>body).message?.ts || "",
        blocks: response_blocks
      });
      core.info('Message updated.')
    } catch (error) {
      logger.error(error);
    }

    core.info('Approval request approved')
    process.exit(0);
  });

  app.action(`slack-approval-reject-${actionId}`, async ({ack, client, body, logger}) => {
    try {
      await ack();

      const response_blocks = (<BlockAction>body).message?.blocks
      response_blocks.pop()
      response_blocks.push({
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': `Rejected by <@${body.user.id}>`,
        },
      })

      await client.chat.update({
        channel: body.channel?.id || "",
        ts: (<BlockAction>body).message?.ts || "",
        blocks: response_blocks
      });
    } catch (error) {
      logger.error(error);
    }

    core.setFailed('Approval request rejected');
    process.exit(1);
  });

  await app.start(3000);
}

process.on('unhandledRejection', (error: any) => {
  core.error(`Unhandled rejection: ${error}`);
});

process.on('uncaughtException', (error: any) => {
  core.error(`Uncaught exception: ${error}`);
});

run();
