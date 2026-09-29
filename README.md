# 《通过 Google Colab / Kaggle 学习模型微调》

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Pages](https://img.shields.io/badge/Online_Book-GitHub_Pages-blue)](https://feng-h.github.io/finetune-colab-mac/)
[![Target Device: M1 8GB](https://img.shields.io/badge/Target_Device-MacBook_Air_M1_8G-00b57a)](https://apple.com)
[![Base Model: Qwen3-4B](https://img.shields.io/badge/Base_Model-Qwen3--4B--Q4_K_M-purple)](https://huggingface.co/Qwen)

> **一本以最普及的 MacBook Air M1（8G 统一内存）为物理验收标尺的工业级微调实战专著。**  
> 打通免费云端 GPU（Google Colab / Kaggle）科学炼丹、早停截断、显存拔插同台盲测，到 GGUF 压制与端侧纯离线私有化交付全链路。

📖 **[在线全屏翻阅精装书 (GitHub Pages 直读) ➔](https://feng-h.github.io/finetune-colab-mac/)**  
📝 **[特别说明：我是如何与 AI 共同写出这本书的？(人机协作认知范式) ➔](./HOW_I_WROTE_THIS_BOOK.md)**

---

## 💡 为什么写这本书？（破除大模型教学的四大沉疴）

市面上 99% 的大模型微调教程要么是“几行代码跑通就宣称精通”的浮夸 Demo，要么是“动辄 8 张 H100 集群”的纸上谈兵。普通开发者面临残酷的现实断层：

1. **算力沉疴**：没有昂贵的专业显卡，如何利用免费算力完成生产级训练？
   * **本书解法**：全面基于 **Kaggle 每周赠送的 30 小时免费 GPU T4** 与 **Google Colab** 双平台，零成本实战！
2. **底座沉疴**：拿 0.5B / 0.6B 的“玩具模型”微调，答非所问毫无实用价值；
   * **本书解法**：全线升级至最新一代 **Qwen3-4B** 黄金底座，兼具强大的推理心智与极高性价比！
3. **落地沉疴**：训完了模型只能扔在云端，不敢也不会在自己的电脑上跑起来；
   * **本书解法**：以最严苛的 **MacBook Air M1（8G 统一内存）** 作为真机验收底线！压制 Q4_K_M GGUF，整机占用内存稳定在 **~3.4GB（活动监视器全绿、不卡顿、不刷 Swap）**！
4. **科学沉疴**：只会盲目把 Epoch 跑完，看不懂 Loss 曲线，把死记硬背当泛化；
   * **本书解法**：用自然语言信息熵、指数衰减推导**“理论物理极值”**，配置验证集考卷与 `EarlyStoppingCallback` 自动早停掐断过拟合！

---

## 📊 真机验收物理账本（MacBook Air M1 8G 实读）

我们在全书第 11 章与第 12 章完成了生产级模型在轻薄本上的纯离线私有化闭环：

| 物理指标 | 测量依据与状态 | 实际读数 |
| :--- | :--- | :--- |
| **底座与格式** | Qwen3-4B-Instruct / llama.cpp Q4_K_M GGUF | **2.50 GB** 磁盘占用 |
| **内存底噪基线** | 宿主机空闲底噪（macOS Sonoma 基础服务） | 约 3.2 GB |
| **模型静态驻留** | 4-bit 量化权重映射进统一内存 | 约 2.6 GB |
| **动态运行峰值** | 2048 上下文窗口 + KV Cache 推理峰值 | **约 3.4 GB** (完全在 8G 安全线内！) |
| **系统压力状态** | 活动监视器（Activity Monitor）内存压力 | **全绿（绿色波形）· 零 Swap 交换！** |
| **网络状态** | 拔掉网线 / 关闭 Wi-Fi 纯物理离线运行 | **正常吐字 · 响应极速 · 隐私 100% 留在本地** |

---

## 🗺️ 全书架构大纲（8 大核心模块 · 13 个碎片）

本书采用正统出版级三级大纲架构：

* **模块 0 · 地基奠定：模型排练的底层循环**
  * 第 1 章 · 训练的本质：一支乐队和一场排练（张量、前向、损失、反向求导链式法则）
* **模块 1 · 显存数学：显存账本与真卡实测**
  * 第 2 章 · 显存账本：为什么 7B 塞不进 16GB（权重、梯度、优化器、激活值四本账）
  * 第 3 章 · 真卡验证：手算 vs 显存实读与真实 OOM 遗言破译
* **模块 2 · 初涉微调：给底座挂上 LoRA 踏板**
  * 第 4 章 · 第一次排练：给 Qwen3 挂上效果器踏板（0.81% 参数微调、4.5 节 `disable_adapter` 旁通机制）
  * 第 5 章 · 收敛诊断：读懂曲线、留住进度、焊死踏板（无损 Merge 数学推导）
* **模块 3 · 模型心智：Prompt 宪法与数据工程**
  * 第 6 章 · 微调的灵魂：System Prompt、模型宪法与条件概率收敛
  * 第 7 章 · 工业级数据工程：非暴力沟通清洗流水线、ChatML 套版与 Loss Masking
  * 第 8 章 · Hugging Face 黄金图鉴：四大垂直领域数据选型、反脆弱清洗实战
* **模块 4 · 科学调参：告别玄学炼丹**
  * 第 9 章 · 超参三剑客：学习率、有效批次与自动化评估体系
* **模块 5 · 上量部署：高并发架构与端侧 Cookbook**
  * 第 10 章 · 部署架构：模型合并、4-bit GGUF 量化与 llama.cpp vs vLLM 选型
  * 第 11 章 · 8G M1 Mac 专属实战：打造私密离线亲子家庭教育顾问原型（阿里魔搭秒级中转、Ollama 内存优雅启停）
* **模块 6 · 终局之战：毕业大项目生产级交付**
  * 第 12 章 · 亲子教育私密顾问：从实验原型到家庭级生产交付（1800+ 条语料扩容、5% 医疗自残就医拒答红线、理论物理极值 1.252 触底验证、Early Stopping 早停掐断、显存拔插踏板盲测、LLM-as-a-Judge 3:0 横扫底座与思维链截断真相）

---

## 🚀 极速上手：30 秒把微调模型跑在你的 Mac 上

如果你手头正有一台 Apple Silicon Mac，可以直接拉取我们在第 12 章训练并开源的生产级亲子教育顾问模型：

```bash
# 1. 创建本地目录并拉取 2.5GB 生产级模型 (ModelScope)
mkdir -p ~/parenting-ai && cd ~/parenting-ai
pip3 install modelscope -q
python3 -c "from modelscope.hub.file_download import model_file_download; model_file_download(model_id='XKJTXTX/parenting-qwen3-4b-production', file_path='parenting-qwen3-4b-production.gguf', local_dir='.')"

# 2. 编写 Modelfile 并注册至 Ollama
cat << 'MODFILE' > Modelfile
FROM ./parenting-qwen3-4b-production.gguf
PARAMETER stop "<|im_start|>"
PARAMETER stop "<|im_end|>"
PARAMETER temperature 0.6
SYSTEM """你是一位温暖、富有同理心的中国亲子教育与家庭心理顾问。请运用非暴力沟通技巧，先接纳家长的焦虑情绪，再从儿童心理发展规律出发给出建议。若涉及自残自伤、严重抑郁倾向或处方药调整，请温柔但坚决地提醒家长寻求线下三甲医院专业精神医学协助。"""
MODFILE

ollama create parenting-production -f Modelfile

# 3. 拔掉网线，纯离线启动对话！
ollama run parenting-production
```

---

## 🖋️ 著者与版权

* **著者**：[Feng-H (https://github.com/Feng-H)](https://github.com/Feng-H)
* **执笔机制**：基于 `pi-scenes` (learning 场景) 与 AI Tutor 共同严苛演练完成。
* **开源许可**：本项目代码与专著遵循 [MIT License](./LICENSE) 开源。欢迎 Star、Fork 与在你的轻薄本上自由运行！
