import axios from "axios";
import TelegramBot from "node-telegram-bot-api";
import { createOpenAI } from "@ai-sdk/openai";
import cheerio from "cheerio";
import { OpenAI as ImageAI } from "openai";
import FormData from "form-data";
import { Readable } from "stream";
import { generateText } from "ai";
import moment from "moment";
import slugify from "slugify";
import crypto from "crypto";
function generateShortImageName(slug) {
  const hash = crypto
    .createHash("md5")
    .update(slug + Date.now())
    .digest("hex");
  return hash.substring(0, 10);
}

const TELEGRAM_BOT_TOKEN = "TELEGRAM BOT TOKEN";
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const openai = createOpenAI({
  apiKey: "OPENAI API KEY",
  compatibility: "strict",
});

const imageMaker = new ImageAI({
  apiKey: "OPENAI API KEY",
});

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function generateContent(extractedText, userMessage) {
  const systemMessage = `You are an AI assistant tasked with rewriting an economics news article based on the HTML content extracted from a webpage. Your goal is to create a new article that conveys the same information as the original but uses different wording and maintains a journalistic tone. Follow these steps:

1. First, you will receive the HTML content extracted from an economics blog post. This content will be provided within <html_content> tags:

<html_content>
{{HTML_CONTENT}}
</html_content>

2. The original URL of the blog post will be provided for reference:

<original_url>
{{ORIGINAL_URL}}
</original_url>

3. Extract the relevant content from the HTML:
   a. Focus on the text within <h1>, <h2>, and <p> tags.
   b. Discard any irrelevant information such as advertisements, comments, or unrelated content.
   c. Pay special attention to the main headline, subheadings, and body paragraphs.

4. Generate a new article based on the extracted content:
   a. Rewrite the information using different words and sentence structures.
   b. Maintain the same core message and key points as the original article.
   c. Use a professional, journalistic tone throughout the new article.
   d. Ensure that the new article is coherent and flows logically.
   e. Do not include any personal opinions or additional information not present in the original content.
   f. It is very important that your answer is always in Spanish, regardless of the original language of the news item.
   g. Use the following plain text formatting:
      - Use "\\n" (escaped newline) for line breaks
      - Use "**" for bold text (e.g., **bold**)
      - Use "*" for italic text (e.g., *italic*)
      - Use "- " for bullet points
   h. Avoid using any characters that may cause issues in JSON format. Escape all necessary characters, including quotation marks (use \\\").

5. You should always respond in JSON format. The JSON must contain the title, subtitle, and the content separately. Do not use code blocks, backticks, or any HTML formatting in your response. Provide only the raw JSON object.

Here's an example of how your output should be structured:

    {
      "title": "El nuevo titulo",
      "subtitle": "El nuevo subtitulo",
      "content": "El nuevo contenido con formato de texto plano.\\n\\n**Texto en negrita** y *texto en cursiva*.\\n\\nUna lista no ordenada:\\n- Primer elemento\\n- Segundo elemento"
    }

Remember, your task is to rewrite the article, not to summarize or analyze it. The new article should be a fresh take on the same information, written as if by a different journalist covering the same story.

Important: Ensure all quotation marks, backslashes, and other special characters in the content are properly escaped for valid JSON. Double-check your output to make sure it's valid JSON before returning it.`;

  const model = openai.chat("gpt-4o");
  const { text } = await generateText({
    model: model,
    messages: [
      { role: "system", content: systemMessage },
      {
        role: "user",
        content: `<html_content>
            ${extractedText}
            </html_content>
            <original_url>
            ${userMessage}
            </original_url>
            `,
      },
    ],
  });
  console.log(text);
  return JSON.parse(text);
}

async function generateImage(title, subtitle) {
  const generateImage = await imageMaker.images.generate({
    model: "dall-e-3",
    prompt: `Generate an image to be used as a header for a news article in a professional blog focused on business and technology topics. The image should:

- Have a modern and professional look
- Feature a clean, minimalist design
- Use bold, contrasting colors
- Incorporate relevant business or tech symbols
- Include abstract or geometric elements to represent complex concepts
- Occasionally use simple charts or data visualizations if appropriate

The image should not contain any text. Instead, it should visually represent the essence of the following title and subtitle:

Title: ${title}
Subtitle: ${subtitle}

Create an image that captures the spirit of this topic in a abstract and symbolic way, suitable for a professional blog header.`,
    n: 1,
    size: "1792x1024",
  });
  return generateImage.data[0].url;
}

async function publishToStrapi(title, subtitle, content, imageUrl) {
  const strapiUrl = "STRAPI URL";

  const slug = slugify(title, { lower: true, strict: true });
  const shortImageName = generateShortImageName(slug);

  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(imageResponse.data, "binary");

    const stream = new Readable();
    stream.push(imageBuffer);
    stream.push(null);

    const formData = new FormData();
    formData.append("files", stream, {
      filename: `${shortImageName}-image.jpg`,
      contentType: "image/jpeg",
    });

    const uploadResponse = await axios.post(
      `${strapiUrl}/api/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
      }
    );

    const uploadedImageId = uploadResponse.data[0].id;

    const postData = {
      titulo: title,
      sumario: subtitle,
      slug: slug,
      category: [35],
      imagenPrincipal: uploadedImageId,
      autor: "Autor",
      contenido: content,
      fecha: moment().format("YYYY-MM-DD"),
    };

    const response = await axios
      .post(
        `${strapiUrl}/api/entradas`,
        { data: postData },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
      .catch((e) => console.log(e.error));

    return response.data;
  } catch (error) {
    console.error("Error publishing to Strapi:", error);
    throw error;
  }
}

async function sendProgressMessage(chatId, message) {
  const progressMessage = await bot.sendMessage(chatId, message);
  let dots = 0;
  const intervalId = setInterval(async () => {
    dots = (dots + 1) % 4;
    await bot.editMessageText(`${message}${".".repeat(dots)}`, {
      chat_id: chatId,
      message_id: progressMessage.message_id,
    });
  }, 3000);
  return { messageId: progressMessage.message_id, intervalId };
}

async function stopProgressMessage(chatId, messageId, intervalId) {
  clearInterval(intervalId);
  await bot.deleteMessage(chatId, messageId);
}

async function sendContentMessage(chatId, imageUrl, jsonFinal) {
  const options = {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: "Generar nueva imagen", callback_data: "new_image" }],
        [{ text: "Generar nuevo contenido", callback_data: "new_content" }],
        [{ text: "Generar todo de nuevo", callback_data: "new_all" }],
        [{ text: "Publicar en Strapi", callback_data: "publish" }],
      ],
    }),
    parse_mode: "HTML",
  };

  await bot.sendPhoto(chatId, imageUrl, {
    caption: `<b>Título:</b> ${jsonFinal.title}\n\n<b>Subtítulo:</b> ${
      jsonFinal.subtitle
    }\n\n<b>Contenido:</b> ${jsonFinal.content.substring(0, 500)}...`,
    ...options,
  });
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  log(`Received message: ${userMessage}`);

  if (userMessage.startsWith("http://") || userMessage.startsWith("https://")) {
    try {
      const { messageId, intervalId } = await sendProgressMessage(
        chatId,
        "Procesando URL"
      );

      log("Processing URL...");
      const response = await axios.get(userMessage);
      const html = response.data;
      const $ = cheerio.load(html);

      let extractedText = "";
      $("h1, h2, h3, p").each((index, element) => {
        extractedText += $(element).text() + "\n";
      });

      await stopProgressMessage(chatId, messageId, intervalId);
      const { messageId: contentMsgId, intervalId: contentIntervalId } =
        await sendProgressMessage(chatId, "Generando contenido con AI");

      log("Generating content with AI...");
      const jsonFinal = await generateContent(extractedText, userMessage);

      await stopProgressMessage(chatId, contentMsgId, contentIntervalId);
      const { messageId: imageMsgId, intervalId: imageIntervalId } =
        await sendProgressMessage(chatId, "Generando imagen con AI");

      log("Generating image with AI...");
      const image_url = await generateImage(
        jsonFinal.title,
        jsonFinal.subtitle
      );

      await stopProgressMessage(chatId, imageMsgId, imageIntervalId);

      log("Sending generated content to user...");
      await sendContentMessage(chatId, image_url, jsonFinal);

      bot.on("callback_query", async (callbackQuery) => {
        const action = callbackQuery.data;
        const msg = callbackQuery.message;

        switch (action) {
          case "new_image":
            const { messageId: newImageMsgId, intervalId: newImageIntervalId } =
              await sendProgressMessage(chatId, "Generando nueva imagen");
            const newImageUrl = await generateImage(
              jsonFinal.title,
              jsonFinal.subtitle
            );
            await stopProgressMessage(
              chatId,
              newImageMsgId,
              newImageIntervalId
            );
            await sendContentMessage(chatId, newImageUrl, jsonFinal);
            break;
          case "new_content":
            const {
              messageId: newContentMsgId,
              intervalId: newContentIntervalId,
            } = await sendProgressMessage(chatId, "Generando nuevo contenido");
            const newContent = await generateContent(
              extractedText,
              userMessage
            );
            await stopProgressMessage(
              chatId,
              newContentMsgId,
              newContentIntervalId
            );
            await sendContentMessage(chatId, image_url, newContent);
            break;
          case "new_all":
            const { messageId: newAllMsgId, intervalId: newAllIntervalId } =
              await sendProgressMessage(
                chatId,
                "Generando nuevo contenido e imagen"
              );
            const newAllContent = await generateContent(
              extractedText,
              userMessage
            );
            const newAllImageUrl = await generateImage(
              newAllContent.title,
              newAllContent.subtitle
            );
            await stopProgressMessage(chatId, newAllMsgId, newAllIntervalId);
            await sendContentMessage(chatId, newAllImageUrl, newAllContent);
            break;
          case "publish":
            try {
              const { messageId: publishMsgId, intervalId: publishIntervalId } =
                await sendProgressMessage(chatId, "Publicando en Strapi");
              await publishToStrapi(
                jsonFinal.title,
                jsonFinal.subtitle,
                jsonFinal.content,
                image_url
              );
              await stopProgressMessage(
                chatId,
                publishMsgId,
                publishIntervalId
              );
              await bot.sendMessage(
                chatId,
                "Contenido publicado exitosamente en Strapi"
              );
            } catch (error) {
              await bot.sendMessage(
                chatId,
                "Error al publicar en Strapi. Por favor, intenta de nuevo."
              );
            }
            break;
        }

        await bot.answerCallbackQuery(callbackQuery.id);
      });
    } catch (error) {
      log(`Error processing URL: ${error.message}`);
      await bot.sendMessage(
        chatId,
        "Hubo un error al procesar la URL. Por favor, intenta con otra."
      );
    }
  } else {
    log("Invalid URL received");
    await bot.sendMessage(
      chatId,
      "Por favor, envía una URL válida que comience con http:// o https://"
    );
  }
});

process.on("unhandledRejection", (reason, promise) => {
  log("Unhandled Rejection at:", promise, "reason:", reason);
});

log("Bot started and listening for messages...");
