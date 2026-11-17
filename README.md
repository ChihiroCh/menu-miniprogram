# 食日 · 家庭菜单

微信小程序 + 响应式网页：家庭独立菜品库，家人共同安排每日三餐。前端 uni-app / Vue 3 / TypeScript，后端 Fastify / Prisma / PostgreSQL。

## 本地启动

需要 Node.js 22+、npm 和可运行的 PostgreSQL 17（或 Docker Desktop）。

```sh
npm install
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
```

分别在两个终端运行：

```sh
npm run dev
```

```sh
npm run dev:web
```

打开 http://localhost:5173 。开发体验昵称：**小满**（林间小家所有者）、**阿远**（同家庭普通成员）。相同昵称对应同一个开发账号；创建任意其他昵称可体验新用户流程。示例导入可重复执行，不覆盖已修改的菜品和菜单。示例图为项目内生成的插画，无外部图片依赖；重新生成需 Python 3 + Pillow：`python3 scripts/generate-food.py`。

如使用现有 PostgreSQL，无需启动 Docker，直接修改 `apps/server/.env` 的 `DATABASE_URL`。后端工作目录为 `apps/server`，`.env`、`uploads` 均相对此目录。

## 微信开发者工具

1. 在 `apps/client/src/manifest.json` 的 `mp-weixin.appid` 填入小程序 AppID。
2. 在 `apps/client/.env` 设置 `VITE_API_URL=http://localhost:3000`，执行 `npm run dev:mp`。
3. 用微信开发者工具导入 `apps/client/dist/dev/mp-weixin`，或使用 `npm run build` 生成的 `apps/client/dist/build/mp-weixin`。
4. 仅本地开发时可在工具内关闭合法域名校验；真机与上线必须使用配置好的 HTTPS API 域名。
5. 用相同开发昵称登录，即可访问网页创建的家庭和菜单。正式登录另见微信配置说明。

## 已实现的业务

- 多家庭创建、切换、家庭隔离，所有者/管理员/成员三类权限。
- 邀请码 7 天有效，可撤销；网页复制邀请链接，小程序复制邀请码或转发邀请，加入幂等。
- 所有者授予/撤销管理员、移除成员；非所有者可以退出；不提供家庭删除和所有权转让。
- 菜品图片、分类、介绍、食材用量、步骤；管理员新增、编辑、上下架；新菜默认下架。
- 普通成员仅看到在售菜品；分类新增、重命名、删除，删除后菜品归入未分类。
- 按北京时间展示今日及每周三餐，备注、添加、移除、保存、跨日期复制和覆盖确认。
- 服务端快照保存菜名、图片、食材及步骤；已有菜谱不会随菜品编辑变动，下架状态单独显示。
- 菜单版本校验和 PostgreSQL Serializable 事务，防止静默覆盖；未保存的页面切换会提示。
- 小程序访问令牌、网页 HttpOnly Cookie、退出撤销会话、请求来源检查和接口限流。
- 图片限 5MB，检查 JPG/PNG/WebP 签名；本地存储与 S3 兼容对象存储适配器。

## 验证

```sh
npm run typecheck
npm run build
npm test
```

`npm test` 运行领域测试；未设置 `TEST_DATABASE_URL` 时明确跳过数据库测试。运行真实数据库验收：

```sh
# 先针对该数据库执行 db:migrate。测试可使用单独的数据库。
TEST_DATABASE_URL='postgresql://menu:menu_dev@localhost:5432/family_menu?schema=public' npm test
```

集成测试使用随机测试用户、家庭，结束时只清理本轮创建的数据；上传测试文件留在 `apps/server/.local/test-uploads`。覆盖家庭隔离、角色越权、邀请过期/撤销、重复加入、跨家庭分类和菜品、上下架、快照、并发写入、复制覆盖、图片校验、Cookie 会话和退出失效。

页面手动验收与上线步骤见 [部署说明](docs/DEPLOYMENT.md)，接口见 [API 说明](docs/API.md)，实际检查结果见 [验收记录](docs/VERIFICATION.md)，依赖告警及发布边界见 [安全说明](docs/SECURITY.md)。
