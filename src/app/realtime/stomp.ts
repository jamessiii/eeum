export function createStompFrame(command: string, headers: Record<string, string>, body = "") {
  const headerLines = Object.entries(headers).map(([key, value]) => `${key}:${value}`);
  return `${command}\n${headerLines.join("\n")}\n\n${body}\0`;
}

export function parseStompMessageBodies(rawData: string) {
  return rawData
    .split("\0")
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const [headerBlock, ...bodyParts] = frame.split("\n\n");
      const [command] = headerBlock.split("\n");
      return {
        command: command.trim(),
        body: bodyParts.join("\n\n"),
      };
    });
}
