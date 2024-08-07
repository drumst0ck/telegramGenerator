# News Generation Telegram Bot

This Telegram bot generates new news articles from URLs and publishes them to a
Strapi CMS. It uses AI to rewrite content and generate images, providing a
seamless workflow for content creation and publication.

## Features

- Extracts content from given URLs
- Generates new articles using OpenAI's GPT models
- Creates images for articles using DALL-E
- Publishes content to Strapi CMS
- Offers options to regenerate content or images
- Supports multiple languages (outputs in Spanish by default)

## Prerequisites

- Node.js
- NPM or Yarn
- Telegram Bot Token
- OpenAI API Key
- Strapi CMS instance

## Installation

1. Clone the repository:

   ```
   git clone https://github.com/drumst0ck/telegramGenerator
   cd telegramGenerator
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Update the Strapi configuration in the `publishToStrapi` function to match
   your CMS structure.

## Usage

1. Start the bot:

   ```
   npm start
   ```

2. In Telegram, send a URL of a news article to the bot.

3. The bot will generate new content and an image, then provide options to:
   - Generate a new image
   - Generate new content
   - Regenerate both content and image
   - Publish to Strapi

## Customization

- To change the output language, modify the system message in the
  `generateContent` function.
- To publish to a different CMS, update the `publishToStrapi` function with the
  appropriate API calls.
- Adjust the image generation prompt in the `generateImage` function to suit
  your needs.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- OpenAI for GPT and DALL-E APIs
- Telegram Bot API
- Strapi CMS

## Disclaimer

This bot is for educational purposes only. Ensure you have the right to use and
republish content before doing so.
