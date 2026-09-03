import { NextRequest, NextResponse } from "next/server";
import { handleAssignSlashCommand } from "@/lib/slack/assignCommand";
import { getSlackSigningSecret, verifySlackRequestSignature } from "@/lib/slack/verify";

export const runtime = "nodejs";

function formValue(params: URLSearchParams, key: string): string {
  return String(params.get(key) ?? "").trim();
}

function slackTextResponse(text: string, status = 200) {
  return NextResponse.json(
    {
      response_type: "ephemeral",
      text,
    },
    { status }
  );
}

/**
 * POST /api/webhooks/slack/commands
 * Slack Slash Command Request URL
 * App 등록 커맨드명: /setmember (Slack은 영문 커맨드명만 허용)
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verified = verifySlackRequestSignature({
    rawBody,
    timestampHeader: request.headers.get("x-slack-request-timestamp"),
    signatureHeader: request.headers.get("x-slack-signature"),
  });

  if (!verified.ok) {
    console.error("[slack/commands] signature failed:", verified.reason, {
      hasSecret: Boolean(getSlackSigningSecret()),
    });
    if (verified.reason === "missing_secret") {
      return slackTextResponse("서버에 SLACK_SIGNING_SECRET 이 없습니다.", 503);
    }
    return new NextResponse("invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = formValue(params, "command");
  const text = formValue(params, "text");
  const userName = formValue(params, "user_name") || formValue(params, "user_id");
  const channelId = formValue(params, "channel_id");

  console.info("[slack/commands] received:", {
    command,
    text,
    userName,
    channelId: channelId || null,
  });

  const allowed = new Set(["/setmember"]);
  if (command && !allowed.has(command)) {
    return slackTextResponse(
      `지원하지 않는 명령입니다: \`${command}\`\n\`/setmember\` 를 사용해 주세요.`
    );
  }

  try {
    const result = await handleAssignSlashCommand({ text, userName });
    return slackTextResponse(result.text);
  } catch (e) {
    console.error("[slack/commands] error:", e instanceof Error ? e.message : e);
    return slackTextResponse("처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
