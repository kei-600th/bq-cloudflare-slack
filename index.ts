interface Env {
  SLACK_WEBHOOK_URL: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const payload = {
      text: "Hello world!",
    };

    try {
      await fetch(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      return new Response("Message sent!");
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  },
};