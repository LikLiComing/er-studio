# ER 工作站（er-studio）

在浏览器里编写 [DBML](https://dbml.dbdiagram.io/home)，右侧实时渲染 ER 图。基于 Vue 3、TypeScript、Vite，编辑器使用 Monaco。

## 在线体验

**https://LikLiComing.github.io/er-studio/**

（需仓库已启用 GitHub Pages，且 Source 为 GitHub Actions。）

## 本地开发

```bash
npm ci
npm run dev
```

浏览器打开 http://localhost:5173/ 即可。

## 构建与校验

```bash
npm run build
node scripts/check.mjs
```

生产构建的静态资源前缀为 `/er-studio/`，与 GitHub Pages 项目站路径一致。本地预览 Pages 效果：

```bash
npm run build
npx vite preview --base /er-studio/ --port 4173
```

访问 http://localhost:4173/er-studio/

## 部署

推送到 `main` 分支会触发 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)，自动构建并发布到 GitHub Pages。也可在 Actions 页手动运行 **Deploy to GitHub Pages**。
