/** Only the current user's instruction routes actions; quoted evidence and history do not. */
export function requestsAnnotation(input: string): boolean {
  const instruction = input.replace(/```[\s\S]*?```/g, '').replace(/^\s*>.*$/gm, '')
    .replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」/g, '');
  return instruction.split(/[。！？!?;；\n]/).some(value => {
    const part = value.trim();
    if (/^(?:标注|注释|圈画|高亮|划线)(?:是|有|能|怎么|如何|为什么)/.test(part)) return false;
    const action = part.search(/标注|注释|圈画|圈划|圈出|高亮|划线|标出/);
    const explain = part.search(/解释|介绍|翻译|说明|讨论|如何|怎么|为什么/);
    if (explain >= 0 && action > explain && !/(?:并|然后|再|，|,)\s*(?:请|帮我|给我|把)/.test(part)) return false;
    if (/(?:不要|别|无需|不用|不必|不需要|先不|暂不|不想).{0,16}(?:标注|注释|圈[画划出]|高亮|划线|标出)|\b(?:do not|don't|never|no need to|without)\b.{0,35}\b(?:annotat\w*|highlight\w*|underlin\w*|mark\w*)/i.test(part)) return false;
    // An imperative, not a question about an annotation feature or an existing highlight.
    if (/(?:帮我|请|给我|给|替我|麻烦|把|将).{0,60}(?:加.{0,6}(?:注释|标注)|做.{0,6}(?:注释|标注)|标注|注释|圈画|圈划|圈出|高亮|划线|标出)|^\s*(?:标注|注释|圈画|圈划|圈出|高亮|划线|标出).{1,80}/.test(part)
      && !/(?:怎么|如何|为什么|啥意思|是什么意思|能否|是否).{0,15}(?:标注|注释|圈画|高亮|划线)/.test(part)) return true;
    return /(?:^|[,，:]\s*|\b(?:and|then)\s+)(?:(?:please|can you|could you|would you|help me|i want you to)\s+)*(?:annotate|highlight|underline|mark)\s+(?!(?:is|are|means|does|works)\b)\S/i.test(part)
      || /\b(?:add|leave|write)\s+(?:a\s+|some\s+)?(?:annotations?|comments?|notes?)\s+(?:to|on|in|beside|for)\b/i.test(part);
  });
}
