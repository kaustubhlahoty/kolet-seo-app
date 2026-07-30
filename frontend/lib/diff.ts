export type DiffOp = { type: 'same' | 'added' | 'removed'; value: string };

// Split on whitespace boundaries while keeping the whitespace itself as tokens,
// so diff output reconstructs the original text exactly when concatenated.
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Word-level LCS diff — legible for prose, unlike a char-level diff. */
export function diffWords(oldText: string, newText: string): DiffOp[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length, m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', value: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'removed', value: a[i] });
      i++;
    } else {
      ops.push({ type: 'added', value: b[j] });
      j++;
    }
  }
  while (i < n) { ops.push({ type: 'removed', value: a[i] }); i++; }
  while (j < m) { ops.push({ type: 'added', value: b[j] }); j++; }

  // Merge adjacent ops of the same type for cleaner rendering
  const merged: DiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.value += op.value;
    else merged.push({ ...op });
  }
  return merged;
}
