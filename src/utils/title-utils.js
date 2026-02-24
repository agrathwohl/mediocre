import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateText } from "ai";
import { getAnthropic } from "./llm-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getExistingTitlesSet() {
  const possiblePaths = [
    path.join(__dirname, "../../docs/data/compositions.json"),
    path.join(process.cwd(), "docs/data/compositions.json"),
  ];

  for (const compositionsPath of possiblePaths) {
    try {
      const content = await fs.promises.readFile(compositionsPath, "utf8");
      const compositions = JSON.parse(content);
      if (Array.isArray(compositions)) {
        const titles = compositions
          .map((c) => c.title)
          .filter((t) => t && typeof t === "string")
          .map((t) => t.toLowerCase().trim());
        return new Set(titles);
      }
    } catch (error) {
      // Continue to next path or return empty (includes ENOENT)
    }
  }

  return new Set();
}

export function extractTitleFromAbc(abcNotation) {
  const match = abcNotation.match(/^T:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

export async function titleExists(title) {
  const existingTitles = await getExistingTitlesSet();
  return existingTitles.has(title.toLowerCase().trim());
}

export async function ensureUniqueTitle(abcNotation, genre) {
  let currentTitle = extractTitleFromAbc(abcNotation);
  let result = abcNotation;
  let attempts = 0;
  const maxAttempts = 3;

  while (currentTitle && (await titleExists(currentTitle)) && attempts < maxAttempts) {
    attempts++;
    console.log(
      `Title "${currentTitle}" already exists, generating unique title (attempt ${attempts})...`,
    );

    const myAnthropic = getAnthropic();
    const model = myAnthropic("claude-3-5-haiku-20241022");

    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: `The title "${currentTitle}" is already taken. Generate ONE new unique creative title for this ${genre} composition. Return ONLY the new title, nothing else. Be specific and inventive - avoid generic titles like "Serialist Chaos" or "Prepared Noise".`,
        },
      ],
      temperature: 0.9 + attempts * 0.05,
      maxTokens: 50,
    });

    const newTitle = text.trim().replace(/^["']|["']$/g, "");
    console.log(`New title: "${newTitle}"`);

    result = result.replace(/^T:\s*.+$/m, `T:${newTitle}`);
    currentTitle = newTitle;
  }

  if (attempts >= maxAttempts && (await titleExists(currentTitle))) {
    const uniqueTitle = `${currentTitle} (${Date.now()})`;
    console.log(
      `Max attempts reached, using timestamped title: "${uniqueTitle}"`,
    );
    result = result.replace(/^T:\s*.+$/m, `T:${uniqueTitle}`);
  }

  return result;
}
