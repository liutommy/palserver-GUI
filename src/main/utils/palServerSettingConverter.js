const palServerSettingConverter = {
  parse(input) {
    if (input) {
      // 移除首尾括號
      const trimmedInput = input.trim().replace(/^\(/, '').replace(/\)$/, '');

      // 分割每一對屬性和值 — 必須忽略引號內的逗號,
      // 否則 ServerName="A, B" 或含逗號的密碼會被切壞
      const pairs = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < trimmedInput.length; i += 1) {
        const ch = trimmedInput[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
          current += ch;
        } else if (ch === ',' && !inQuotes) {
          pairs.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      if (current) pairs.push(current);

      // 初始化 JSON 對象
      const result = {};

      // 遍歷每一對屬性和值
      pairs.forEach((pair) => {
        // 只切第一個等號 — 值裡可能還有 '='
        const eqIndex = pair.indexOf('=');
        if (eqIndex === -1) return;
        const key = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1);

        // 處理布林值和數字
        let formattedValue;
        if (value === 'True' || value === 'False') {
          formattedValue = value === 'True';
        } else if (value !== '' && !Number.isNaN(Number(value))) {
          formattedValue = parseFloat(value);
        } else {
          formattedValue = value;
        }

        // 將屬性和值添加到 JSON 對象
        result[key] = formattedValue;
      });

      return result;
    }
  },
  format(inputJson) {
    if (inputJson) {
      // 初始化一個空的字符串來構建結果
      let result = '(';

      // 遍歷 JSON 對象的所有鍵值對
      Object.entries(inputJson).forEach(([key, value], index, array) => {
        // 轉換布爾值的表示
        if (typeof value === 'boolean') {
          value = value ? 'True' : 'False';
        }

        // 將鍵值對轉換為字符串,並添加到結果字符串
        result += `${key}=${value}`;

        // 如果不是最後一個元素,則添加逗號和空格
        if (index < array.length - 1) {
          result += ',';
        }
      });

      // 在字符串末尾添加閉合括號
      result += ')';

      return result;
    }
  },
};
export default palServerSettingConverter;
