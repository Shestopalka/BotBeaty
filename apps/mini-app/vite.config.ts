import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import type { Plugin } from 'vite';

// Telegram WKWebView надсилає Origin: null (sandboxed) — crossorigin викликає CORS violation
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    apply: 'build',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, '');
    },
  };
}

// Вбудовуємо CSS в <style> — прибираємо окремий HTTP запит на CSS файл.
// Telegram WKWebView на iOS блокує/перехоплює запити на assets, тому inline CSS надійніше.
function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const htmlPath = path.join(distDir, 'index.html');
      if (!existsSync(htmlPath)) return;

      let html = readFileSync(htmlPath, 'utf-8');
      const match = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"[^>]*>/);
      if (!match) {
        console.log('ℹ️  inline-css: no <link rel="stylesheet"> found');
        return;
      }

      // href може бути "/assets/index-xxx.css" → dist/assets/index-xxx.css
      const cssHref = match[1].replace(/^\//, '');
      const cssPath = path.join(distDir, cssHref);
      if (!existsSync(cssPath)) {
        console.warn('⚠️  inline-css: CSS file not found:', cssPath);
        return;
      }

      const css = readFileSync(cssPath, 'utf-8');
      html = html.replace(match[0], `<style>${css}</style>`);
      writeFileSync(htmlPath, html, 'utf-8');
      unlinkSync(cssPath);
      console.log(`✅ inline-css: CSS вбудовано в index.html (${css.length} байт), файл видалено`);
    },
  };
}

const proxyConfig = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), removeCrossorigin(), inlineCss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    headers: {
      'ngrok-skip-browser-warning': '1',
    },
    proxy: proxyConfig,
  },
  // Preview mode (production build) — використовується для тестування через Telegram
  preview: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    headers: {
      'ngrok-skip-browser-warning': '1',
    },
    proxy: proxyConfig,
  },
});
