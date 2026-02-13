# 小马糕口令大厅

一个用于发布/浏览王者荣耀小马糕口令的轻量 Web 服务，支持举报、统计、公告与管理员后台。

## 功能

- 大厅展示：查看所有今日口令、复制次数、举报入口
- 发布口令：发布后仅本浏览器可删除
- 举报统计：同一浏览器对同一条口令仅能举报一次
- 每日清空：每天 00:00 自动清空当日口令（以服务器时区为准）
- 公告管理：管理员可发布/清空公告
- 管理后台：需要账号/密码
- 防探测页面：`/admin` 和 `/Admin` 会显示提示页

## 访问路径

- 大厅首页：`/`
- 发布口令：`/publish.html`
- 管理后台：`/xmg-7f3`

> 若需修改后台入口路径，请编辑 `server.js` 中的路由。

## 环境变量

```
PORT=3000
TZ=Asia/Shanghai
ADMIN_USER=your_admin
ADMIN_PASS=your_password
```

## Docker 部署（推荐）

```
docker compose up -d --build
```

## 本地运行

```
npm install
npm start
```

默认端口为 `3000`，浏览器访问 `http://localhost:3000`。

## 目录结构

```
public/      # 前台资源（大厅/发布页/脚本/样式）
private/     # 后台页面与诱导页（不对外静态公开）
server.js    # 后端服务
```

## 注意事项

- 举报与删除逻辑基于浏览器的 localStorage，清除浏览器数据会丢失删除权限与举报记录。
- 数据存储于 `data/db.json`，适合轻量使用，不适合高并发。
- 管理员账号密码通过 Basic Auth 校验，请务必在 HTTPS 环境下使用。

## License

MIT
