# 部署与微信接入

## 正式微信登录

1. 准备微信小程序、微信开放平台网站应用，并将两者绑定至同一开放平台账号。完成网站应用相关审核。
2. 根据微信当前规则确认两个应用均可获取 UnionID。本项目不会在缺少 UnionID 时创建正式账号，避免双端重复身份。
3. 后端配置 `WECHAT_MINI_APP_ID`、`WECHAT_MINI_SECRET`、`WECHAT_WEB_APP_ID`、`WECHAT_WEB_SECRET`、`WECHAT_CALLBACK_URL`。
4. 网站应用回调配置指向 API 域名，回调路径为 `/api/auth/wechat/callback`。网页扫码使用 OAuth state Cookie 防止跨会话回调。
5. 小程序配置 request、uploadFile 和图片下载合法域名；对象存储域名也须满足图片访问要求。
6. 将小程序 AppID 写入前端 manifest。设置前端 `VITE_API_URL` 为正式 API 地址后重新构建；API 地址是构建时配置。
7. 在双端登录同一微信，确认用户 ID 一致，且能看到同一家庭和菜单。正式身份字段及 Secret 不返回前端。

网页以电脑微信扫码为首版标准入口；响应式页面支持手机查看和操作，微信内网页授权暂不提供。微信扫码授权页的手机兼容性取决于微信平台。

## 生产部署

- 后端 Node.js 22+，PostgreSQL 17，建议网页与 API 使用同一站点，例如 `https://menu.example.com` 与同源 `/api` 反向代理。Cookie 使用 HttpOnly、Secure、SameSite=Lax。
- 后端设置 `NODE_ENV=production`、`DEV_LOGIN=false`、HTTPS 的 `WEB_URL` 与 `API_PUBLIC_URL`。生产配置错误会拒绝启动。
- 设置 `STORAGE_DRIVER=s3` 及 `.env.example` 列出的 S3 参数，支持 AWS S3、R2、MinIO 等兼容服务。对象公共读取或 CDN 地址填 `S3_PUBLIC_URL`；不要向客户端暴露存储密钥。
- API 与网页使用不同域名时，建议用网页域名反向代理 API，避免浏览器跨站 Cookie 限制；尤其图片上传依赖 H5 同源请求。
- 执行 `npm ci`、`npm run db:generate`、`npm run db:migrate`、`npm run build`。数据库迁移前备份生产数据库。不要在生产运行示例导入。
- 网页静态产物为 `apps/client/dist/build/h5`，使用 hash 路由。小程序产物为 `apps/client/dist/build/mp-weixin`，通过微信开发者工具审核发布。
- 后端可用 `docker build -f apps/server/Dockerfile -t family-menu-api .` 构建；运行时传入环境变量，连接部署的 PostgreSQL。镜像启动时执行迁移，然后监听 3000 端口。
- 反向代理上传大小限制至少设为 6MB；应用图片限制为 5MB。HTTPS 代理保留请求 Origin；不要随意扩大允许来源。
- `/api/health` 检查数据库连接；配置进程重启、错误日志收集、数据库备份、对象存储生命周期和过期会话定期清理。基础限流为单实例内存限流，多实例部署应在网关统一限流。

## 手工验收清单

1. 网页分别以 390px 和 1440px 宽度检查登录、菜单、菜品库、家庭面板；确认移动端底部导航不遮挡操作。
2. 用“小满”新增菜谱、上传图片、填写食材与步骤，确认保存后下架，再上架。
3. 用“阿远”查看并添加三餐，确认看不到菜品管理入口；不能以直接调用 API 绕过权限。
4. 修改菜谱并下架，确认已安排的快照保留且显示下架，不能新增到别的餐次。
5. 两个会话打开同一天菜单；分别编辑并保存，后保存的一方收到冲突提示。
6. 新建第二个家庭，检查分类、菜品、成员和菜单隔离；用邀请加入、重复加入、撤销和过期测试。
7. 复制到已有计划日期，确认有覆盖提示；确认期间另一会话修改目标时，复制被拒绝。
8. 微信开发者工具导入构建产物，重复核心流程；真机验证图片上传和网络合法域名。
9. 配齐微信后，验证真实扫码、小程序登录、同一 UnionID、退出与重新登录，最后再进行发布。
