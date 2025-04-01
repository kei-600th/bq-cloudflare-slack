export default {
  async fetch(request, env, ctx) {
    const payload = {
      text: "Hello world!",
    };

    await fetch("https://hooks.slack.com/services/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", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return new Response("Message sent!");
  },
};
