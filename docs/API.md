# API 约定

所有路径以 `/api` 开头。网页同源 Cookie；小程序 `Authorization: Bearer <token>`。成功返回 JSON，失败返回 `{ "message": "中文提示" }`。401 登录失效、403 无权限、404 不存在、409 版本冲突或名称重复、413 图片过大。日期为北京时间日历日期 `YYYY-MM-DD`。

| 路径 | 方法 | 说明 |
|---|---|---|
| `/health` | GET | 检查数据库连接，不暴露配置 |
| `/auth/config` | GET | 可用登录方式 |
| `/auth/dev` | POST | 仅开发：`{ name, mini }`；mini 为 true 时返回 token，否则设置 Cookie |
| `/auth/wechat/mini` | POST | `{ code }` 换取小程序会话 |
| `/auth/wechat/web` | GET | 生成 state Cookie，跳转微信扫码 |
| `/auth/wechat/callback` | GET | 校验 state、换取身份，设置会话并跳回网页 |
| `/auth/logout` | POST | 撤销当前会话 |
| `/me` | GET / PATCH | 读取用户 / 修改 `{ name }` |
| `/families` | GET / POST | 当前家庭列表 / 创建 `{ name }` |
| `/invites/join` | POST | `{ code }` 加入家庭 |

以下路径前缀为 `/families/:familyId`，每次请求都在服务端检查家庭权限。

| 后缀 | 方法 | 权限与输入 |
|---|---|---|
| `/members` | GET | 成员可查看，不返回用户私有身份字段 |
| `/members/:userId` | PATCH | 所有者：`{ role: "ADMIN" 或 "MEMBER" }`，不能修改所有者 |
| `/members/:userId` | DELETE | 所有者移除他人；成员退出自己，所有者不能退出 |
| `/invites` | GET / POST | 管理员查看有效邀请 / 新建 7 天邀请 |
| `/invites/:id` | DELETE | 管理员撤销邀请 |
| `/categories` | GET / POST | 成员查看 / 管理员新增 `{ name }` |
| `/categories/:id` | PATCH / DELETE | 管理员重命名 `{ name }` / 删除 |
| `/dishes` | GET | `search`、`categoryId`、`status=all\|available\|unavailable`；普通成员强制仅在售 |
| `/dishes` | POST | 管理员新增，默认下架 |
| `/dishes/:id` | PUT | 管理员编辑完整菜谱，不修改上架状态 |
| `/dishes/:id/status` | PATCH | 管理员：`{ available: boolean }` |
| `/images` | POST | 管理员上传，multipart `file`，返回 `{ url }` |
| `/plans?from=…&to=…` | GET | 最多 31 天的计划摘要 |
| `/plans/:date` | GET / PUT | 成员查看 / 保存共同菜单 |
| `/plans/:date/copy` | POST | 成员复制到其他日期 |

菜品写入示例：

```json
{
  "name": "番茄炒蛋", "categoryId": null, "image": "", "notes": "少糖",
  "ingredients": [{ "name": "鸡蛋", "amount": "3 个" }],
  "steps": ["打散蛋液", "下锅炒熟"]
}
```

计划读取结果包含 `version`、`meals`、`availability`；无计划时版本为 0。每餐的 `dishes` 是服务端快照，包含 `dishId`、名称、图片、备注、食材、做法。`availability` 单独描述当前上下架状态。

保存只提交菜品 ID 和备注，服务端生成快照，禁止由客户端伪造：

```json
{
  "version": 0,
  "meals": {
    "breakfast": { "dishIds": [], "notes": "" },
    "lunch": { "dishIds": ["dish-id"], "notes": "少盐" },
    "dinner": { "dishIds": [], "notes": "" }
  }
}
```

同一餐不得重复 ID；已在该餐的下架菜可以保留，不能新增到其他餐次。409 时重新读取计划再编辑，不能无条件重试覆盖。

复制输入 `{ targetDate, targetVersion, sourceVersion, overwrite }`：先读取目标版本；已有记录需 `overwrite: true`。复制使用原始快照，允许保留历史计划中的下架菜。来源或目标在确认后被他人修改时返回 409。
