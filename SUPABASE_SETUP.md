# LoveStory 云端共享手帐设置

现有页面、BGM 和本地记录保留。此版本新增 Supabase 邮箱密码登录、私有照片、共享回忆、删除、自动刷新、旧记录迁移及含照片的云端备份。

**代码已接好不等于项目已经连接。** 首次必须创建自己的 Supabase 项目、执行 SQL、指定成员并填入公开配置。未配置时页面仍使用本机模式。

## 1. 创建项目和两个账号

1. 打开 https://supabase.com/dashboard ，创建项目；保存数据库密码，勿上传至 GitHub。
2. 在 Authentication → Users 中创建两个邮箱密码账号（Add user / Create new user，必要时勾选自动确认）。分别通过私密渠道交给本人密码。不要把密码写入代码或发到公开 issue。
3. 记录两个账号的 User UID。建议在 Auth 设置中关闭公开注册；网页没有注册入口。即使第三人能注册，也没有成员权限。
4. 若忘记密码，管理员通过 Supabase 支持的用户管理流程重置；本版不包含邮件找回页面。

## 2. 初始化数据库、权限和私有存储

1. SQL Editor → New query，复制仓库中的 `supabase-setup.sql` 并运行。
2. 保存结果中 `love_journals.id`（手帐 UUID）。
3. 替换下面三个占位符后，在 SQL Editor 单独运行：

```sql
insert into public.love_members(journal_id,user_id) values
('JOURNAL_UUID','FIRST_AUTH_USER_UUID'),
('JOURNAL_UUID','SECOND_AUTH_USER_UUID')
on conflict do nothing;
```

所有 UUID 均保留单引号。两个账号使用同一个 JOURNAL_UUID。成员只能由项目管理员添加；网页没有创建手帐或邀请第三人的权限。

初始化脚本启用 RLS，未登录无权读取，登录用户只能访问自己加入的手帐。照片桶 `love-photos` 为私有，限制 JPEG / 5 MB，网页生成短期签名 URL。不要另加 `true` / public 读写策略；已有项目若存在其他宽松 policy，应先检查和清理。建议使用独立新项目。

## 3. 填入前端配置

在项目 Connect / Settings → API Keys 或对应页面取得：

- Project URL，如 `https://abcdef.supabase.co`
- **Publishable key**，一般以 `sb_publishable_` 开头（也兼容 legacy anon key）

编辑仓库根目录 `supabase-config.js`：

```js
window.LOVE_SUPABASE = Object.freeze({
  url: 'https://YOUR_PROJECT.supabase.co',
  publishableKey: 'sb_publishable_YOUR_KEY',
  journalId: 'YOUR_JOURNAL_UUID'
});
```

这些是允许用于浏览器的公开配置；授权依靠登录身份和 RLS。**不要填 service_role、sb_secret、数据库密码或用户密码。** 提交配置后 GitHub Pages 会部署。这里的默认校验仅接受标准 Supabase 托管项目域名。

## 4. 使用和迁移

- 打开 https://chistrongwen.github.io/LoveStory/ ，在回忆区点击“登录共同手帐”。两人使用各自账号登录。
- 云端模式点击“记下这一刻”：照片先压缩为 JPEG，照片上传成功后保存文字记录；失败会保留表单，可重试。联网且页面可见时每 30 秒刷新，也可点击“刷新云端”。
- 云端记录只暂存在当前页面内存，不写入旧的 localStorage 手帐；退出会清空当前页面的云端内容。
- 登录后点击“迁移本机回忆”，把该浏览器旧记录复制到共同手帐。原记录不删除。相同记录按内容 SHA-256 去重，可重试；修改过内容的记录视为新记录。
- 旧照片在另一台设备时，先在那台设备导出本地备份；在需要的浏览器切换“本机手帐”，导入后再迁移。**导入会替换本机记录**，请先备份。
- 云端模式的“导出手帐备份”包含实际照片，不只保存会过期的签名链接。该文件包含私人信息，妥善保存。
- 两位成员都可以添加和删除共同回忆；当前不含编辑功能。删除同时清理照片，照片清理失败时会提示。
- **仅回忆和照片共享。** 纪念日、待办清单、音乐选择仍为各浏览器本地设置。当前无离线上传队列，网络失败不会假装已同步。
- 手机与电脑不需要登录 GitHub；登录的是你们的 Supabase 手帐账号。

## 5. 上线验证

1. 账号 A 上传一条带照片回忆；账号 B 在另一台设备登录并刷新，应可查看。
2. 用第三个未加入成员的测试账号验证：应提示未加入手帐，不能读取、上传或删除（SQL 权限不能只依赖页面按钮）。未登录直接访问表 / 私有存储应被拒绝。
3. B 删除测试回忆，A 刷新后应消失；Storage 中对应照片也应删除。
4. 迁移本地记录两次，应第二次显示“已存在”，本机原记录仍保留。
5. 关闭网络后提交，应提示失败且保留表单；恢复网络后可重试。
6. 导出云端备份，检查含 `data:image/jpeg;base64,...` 照片；退出登录后应只显示本机 / 示例记录。

## 常见问题

- “云端待连接”：`supabase-config.js` 尚未填写或值无效。
- “云端组件加载失败”：浏览器未能访问 jsDelivr，检查网络后重试。
- “账号尚未加入共同手帐”：核对 journalId 和 love_members 中的两个 UID。
- “relation does not exist / RLS / permission denied”：执行 SQL，并检查项目 URL、成员和 Storage policy，不能用关闭 RLS 的方式解决。
- 免费项目暂停：在 Supabase Dashboard 恢复后重试。
- 网络速度取决于双方网络和项目区域，上线后应在双方常用设备测试。

本次可执行验证覆盖 JavaScript 语法与模拟云端交互；尚未提供实际项目配置，因此真实 Supabase 登录、存储、RLS 和跨设备同步需要按以上步骤验收。
