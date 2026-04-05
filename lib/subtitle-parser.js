/**
 * SubtitleParser — Robust VTT/SRT Parser
 * Xử lý file chuẩn lẫn file AI-generated méo mó
 */
const SubtitleParser = {
  // Regex linh hoạt: chấp nhận -->, ->, - >, --->
  ARROW_REGEX: /-+\s*>+/,
  // Regex nhận diện dòng timestamp
  TIMESTAMP_LINE_REGEX: /\d{1,2}:\d{2}[:.,]\d{2,3}\s*-+\s*>+\s*\d{1,2}:\d{2}[:.,]\d{2,3}/,

  /**
   * Parse file content thành mảng cue + warnings
   * @param {string} content - Nội dung file
   * @param {string} format - 'vtt' hoặc 'srt'
   * @returns {{ cues: Array<{start:number, end:number, originalText:string, translatedText:string}>, warnings: string[] }}
   */
  parse(content, format) {
    // Bước 0: Chuẩn hóa line endings
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Bước 1: Fix file dính liền (thiếu dòng trắng giữa cues)
    content = this.fixMissingBlankLines(content);

    // Bước 2: Parse theo format
    const cues = (format === 'vtt')
      ? this.parseVTT(content)
      : this.parseSRT(content);

    // Bước 3: Validate
    const warnings = this.validate(cues, content);

    return { cues, warnings };
  },

  /**
   * Fix lỗi 2A: tự chèn dòng trắng trước mỗi dòng timestamp nếu thiếu
   */
  fixMissingBlankLines(content) {
    const lines = content.split('\n');
    const fixed = [];
    for (let i = 0; i < lines.length; i++) {
      if (this.TIMESTAMP_LINE_REGEX.test(lines[i]) && i > 0) {
        const prevLine = lines[i - 1].trim();
        // Chèn dòng trắng nếu dòng trước không rỗng và không phải cue ID (số thuần)
        if (prevLine !== '' && !/^\d+$/.test(prevLine)) {
          fixed.push('');
        }
      }
      fixed.push(lines[i]);
    }
    return fixed.join('\n');
  },

  parseVTT(content) {
    const cues = [];
    const blocks = content.split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const timeLineIndex = lines.findIndex(l => this.TIMESTAMP_LINE_REGEX.test(l));
      if (timeLineIndex === -1) continue;

      const timeParts = lines[timeLineIndex].split(this.ARROW_REGEX).map(s => s.trim());
      if (timeParts.length < 2) continue;

      const text = lines.slice(timeLineIndex + 1).join(' ').trim();
      if (text) {
        cues.push({
          start: this.timeToSeconds(timeParts[0]),
          end: this.timeToSeconds(timeParts[1]),
          originalText: text,
          translatedText: text
        });
      }
    }
    return cues;
  },

  parseSRT(content) {
    const cues = [];
    const blocks = content.split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const timeLineIndex = lines.findIndex(l => this.TIMESTAMP_LINE_REGEX.test(l));
      if (timeLineIndex === -1) continue;

      const timeParts = lines[timeLineIndex].split(this.ARROW_REGEX).map(s => s.trim());
      if (timeParts.length < 2) continue;

      const text = lines.slice(timeLineIndex + 1).join(' ').trim();
      if (text && timeParts[0] && timeParts[1]) {
        cues.push({
          start: this.timeToSeconds(timeParts[0]),
          end: this.timeToSeconds(timeParts[1]),
          originalText: text,
          translatedText: text
        });
      }
    }
    return cues;
  },

  /**
   * "00:01:23.456" hoặc "00:01:23,456" → 83.456 (giây)
   */
  timeToSeconds(timeStr) {
    timeStr = timeStr.replace(',', '.'); // Fix dấu phẩy (lỗi 2C)
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 +
             parseFloat(parts[1]) * 60 +
             parseFloat(parts[2]);
    }
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 +
             parseFloat(parts[1]);
    }
    return parseFloat(parts[0]);
  },

  /**
   * Validate kết quả parse, trả về mảng warning strings
   */
  validate(cues, originalContent) {
    const warnings = [];
    const lineCount = originalContent.split('\n').length;

    // 1. File dài nhưng quá ít cue
    if (lineCount > 20 && cues.length < 5) {
      warnings.push(
        `⚠️ File có ${lineCount} dòng nhưng chỉ nhận diện được ${cues.length} câu. ` +
        `File có thể bị thiếu dòng trắng giữa các câu hoặc format sai. Hãy kiểm tra lại!`
      );
    }

    // 2. Cue quá dài (gộp nhiều câu)
    const longCues = cues.filter(c => c.translatedText.length > 300);
    if (longCues.length > 0) {
      warnings.push(
        `⚠️ Phát hiện ${longCues.length} câu phụ đề dài bất thường (>300 ký tự). ` +
        `Có thể file bị gộp nhiều câu vào nhau.`
      );
    }

    // 3. Timestamps không tăng dần
    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start < cues[i - 1].start) {
        warnings.push(
          `⚠️ Thứ tự thời gian không đúng tại câu ${i + 1}. File có thể bị xáo trộn.`
        );
        break;
      }
    }

    return warnings;
  }
};
