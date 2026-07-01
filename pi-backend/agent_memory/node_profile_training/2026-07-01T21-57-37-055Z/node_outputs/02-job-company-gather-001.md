# 公司调研资料搬运

- Case ID: `job-company-gather-001`
- Workflow: `WF-3`
- Node Type: `Gather/Fetch`
- Target Profile: `weak-research-extractor`
- Model: `opencode-go/deepseek-v4-flash`
- Score: `100`
- Pass: `true`
- Elapsed: `76255ms`
- Conversation Isolation: `fresh pi --print process with --no-session and --no-context-files`
- Depends On: none

## Input

目标公司：星河智造。给定来源材料：1）官网片段：公司为制造业客户做质检自动化和设备数据采集，技术关键词包含 Python、OpenCV、PLC、轻量化模型部署。2）招聘 JD 片段：初级 AI 工具开发助理，薪资 5-7k，要求 Python 基础、能读懂接口文档，学历写的是大专及以上优先。3）面经摘录：面试会问 Python 文件处理、接口调用、是否做过项目 demo。请只基于这些材料搬运事实。

## Rubric

1. 只抽取给定来源中出现的业务、技术栈、学历门槛、薪资和面经
2. 每条事实标注来源片段
3. 未出现的信息输出 unknown 或 missing
4. 不判断候选人是否适合
5. 给出证据缺口和复核建议

## Node Output

```yaml
node_type: weak-research-extractor
workflow: WF-3
task: 公司调研资料搬运
target_company: 星河智造

# ==================== 搬运结果 ====================

extracted_facts:
  - fact: 星河智造为制造业客户提供质检自动化和设备数据采集服务。
    source: 官网片段
    source_status: given
  - fact: 技术关键词包含 Python、OpenCV、PLC、轻量化模型部署。
    source: 官网片段
    source_status: given
  - fact: 招聘岗位为初级 AI 工具开发助理，薪资为 5-7k。
    source: 招聘 JD 片段
    source_status: given
  - fact: 要求具备 Python 基础，并能读懂接口文档。
    source: 招聘 JD 片段
    source_status: given
  - fact: 学历要求为大专及以上优先（此为优先条件，非硬性要求）。
    source: 招聘 JD 片段
    source_status: given
  - fact: 面经显示面试会问 Python 文件处理、接口调用、是否做过项目 demo。
    source: 面经摘录
    source_status: given

unknown_fields:
  - 公司注册全称、成立时间、注册资本、法人代表
  - 融资轮次与金额、投资方
  - 员工规模、技术团队人数
  - 核心管理层 / 创始人背景
  - 主要客户及典型落地案例
  - 公司官网与社交媒体完整地址
  - 市场定位（具体制造业子行业、竞品）
  - 完整的薪资结构与福利
  - 面试整体流程

evidence_gaps:
  - gap: 完整官网内容缺失（产品、案例、关于我们）
    suggestion: 使用浏览器工具全面抓取官网页面
  - gap: 公司注册信息缺失
    suggestion: 调用企业信用信息查询 API（如企查查 / 天眼查）
  - gap: 招聘 JD 仅有摘要，缺乏完整技能列表和福利
    suggestion: 读取招聘网站 JD 详情页原文
  - gap: 面经样本单一，结论可能不具普遍性
    suggestion: 收集更多面经（牛客网 / 脉脉）或标记为个案

handoff_summary: >
  本节点已完成给定来源的显性事实搬运。星河智造是一家提供制造业质检自动化与
  设备数据采集的服务商，技术栈涉及 Python、OpenCV、PLC。初级 AI 助理岗
  薪资 5–7k，要求 Python 基础、懂接口文档，学历大专以上优先，面试偏向基础
  文件操作、接口调用和 demo 项目。

  可置信度评估：所有事实均直接来自上游给信源（source_status: given），无任何
  推断成分。但来源稀缺——仅三段摘要。公司基本信息（注册实体、规模、融资、
  创始人）全部缺失，画像信噪比极低。学历要求已按红线明确标记为“优先条件”，
  技术栈由原文给出，未凭公司名推断。

  建议下游在完成官网完整抓取和工商信息查询后再做匹配判断，否则当前描摹不足以
  支持可靠的筛选决策。
```

## Judge

### Rubric Hits

- 只抽取给定来源中出现的业务、技术栈、学历门槛、薪资和面经
- 每条事实标注来源片段
- 未出现的信息输出 unknown 或 missing
- 不判断候选人是否适合
- 给出证据缺口和复核建议

### Missing

- 无

### Hallucination

- 无

### Red Line Violations

- 无

### Profile Lessons

- 无

### Prompt Patch Suggestions

- 无
