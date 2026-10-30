/** Only the current user's instruction routes actions; quoted evidence and history do not. */
export function requestsAnnotation(input: string): boolean {
  const instruction = input.replace(/```[\s\S]*?```/g, '').replace(/^\s*>.*$/gm, '')
    .replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」/g, '')
    .replace(/批注/g, '注释').replace(/画线|划下划线|加下划线|加下画线/g, '划线')
    .replace(/圈[画划花化]|圈起来|圈出来|圈一下|圈上/g, '圈画')
    .replace(/划出来|划出|划一下/g, '划线');
  // Colloquial drawing requests refer to PDF marks only when they name source text.
  // Keep diagram requests (e.g. 画出流程图) on the ordinary chat/image path.
  const normalized = /原文|段落|句子|实验|章节|这一部分|这部分|这段|pdf/i.test(instruction)
    && !/流程图|示意图|架构图|曲线|生成.{0,6}(?:图片|图像)|画.{0,8}(?:图|曲线)/.test(instruction)
    ? instruction.replace(/(?<!圈)(?:画出来|画出|画一下|画上)/g, '划线') : instruction;
  return normalized.split(/[。！？!?;；\n]/).some(value => {
    const part = value.trim();
    if (/^(?:标注|注释|圈画|高亮|划线)(?:是|有|能|怎么|如何|为什么)/.test(part)) return false;
    if (/(?:只|仅).{0,10}(?:回答|回复|输出|聊天|对话)(?:框|中|里)|(?:不要|不用|别).{0,12}(?:PDF|原文|文献).{0,8}(?:改|写|画|划|标|注)/i.test(part)) return false;
    if (/(?:想|希望|需要)(?:知道|了解|学习)|(?:怎么|如何|为什么|是否).{0,20}(?:标注|注释|高亮|划线)/.test(part)) return false;
    const action = part.search(/标注|注释|圈画|圈划|圈出|高亮|划线|标出/);
    const explain = part.search(/解释|介绍|翻译|说明|讨论|如何|怎么|为什么/);
    if (explain >= 0 && action > explain && !/(?:并且|并|然后|再|，|,).{0,24}(?:标注|注释|圈画|圈出|高亮|划线|标出)/.test(part)) return false;
    if (/(?:不要|别|无需|不用|不必|不需要|先不|暂不|不想).{0,16}(?:标注|注释|圈[画划出]|高亮|划线|标出)|\b(?:do not|don't|never|no need to|without)\b.{0,35}\b(?:annotat\w*|highlight\w*|underlin\w*|mark\w*)/i.test(part)) return false;
    // An imperative, not a question about an annotation feature or an existing highlight.
    if (/(?:帮我|请|给我|给|替我|麻烦|把|将|并且|然后|并|用.{0,8}色|找出|找到|找一下|定位|(?:我)?(?:需要|希望|想要)(?:的是)?(?:你)?|直接|进行|按照|按|在\s*(?:原文|论文|pdf)).{0,160}(?:加.{0,6}(?:注释|标注)|做.{0,6}(?:注释|标注)|标注|注释|圈画|圈划|圈出|高亮|划线|标出)|^\s*(?:标注|注释|圈画|圈划|圈出|高亮|划线|标出).{1,80}/i.test(part)
      && !/(?:怎么|如何|为什么|啥意思|是什么意思|能否|是否).{0,15}(?:标注|注释|圈画|高亮|划线)/.test(part)) return true;
    return /(?:^|[,，:]\s*|\b(?:and|then)\s+)(?:(?:please|can you|could you|would you|help me|i want you to)\s+)*(?:annotate|highlight|underline|mark)\s+(?!(?:is|are|means|does|works)\b)\S/i.test(part)
      || /\b(?:add|leave|write)\s+(?:a\s+|some\s+)?(?:annotations?|comments?|notes?)\s+(?:to|on|in|beside|for)\b/i.test(part);
  });
}
