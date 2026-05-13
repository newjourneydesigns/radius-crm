// Argv parsing + output helpers.

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let key, val;
      if (eq !== -1) {
        key = a.slice(2, eq);
        val = a.slice(eq + 1);
      } else {
        key = a.slice(2);
        const next = argv[i + 1];
        if (next != null && !next.startsWith('--')) {
          val = next;
          i++;
        } else {
          val = true;
        }
      }
      // multiple uses of the same flag → array
      if (key in flags) {
        flags[key] = Array.isArray(flags[key]) ? [...flags[key], val] : [flags[key], val];
      } else {
        flags[key] = val;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function asBool(v, dflt = false) {
  if (v === true || v === 'true' || v === '1') return true;
  if (v === false || v === 'false' || v === '0') return false;
  return dflt;
}

export function printJSON(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function printTable(rows, columns) {
  if (!rows || rows.length === 0) {
    process.stdout.write('(no results)\n');
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  const widths = cols.map((c) => c.length);
  const stringRows = rows.map((r) =>
    cols.map((c, i) => {
      const v = r[c];
      const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const truncated = s.length > 60 ? s.slice(0, 57) + '...' : s;
      if (truncated.length > widths[i]) widths[i] = truncated.length;
      return truncated;
    })
  );
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  const header = cols.map((c, i) => pad(c, widths[i])).join('  ');
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  process.stdout.write(header + '\n' + rule + '\n');
  for (const sr of stringRows) {
    process.stdout.write(sr.map((s, i) => pad(s, widths[i])).join('  ') + '\n');
  }
}

export function output(data, { json = false, columns } = {}) {
  if (json) return printJSON(data);
  if (Array.isArray(data)) return printTable(data, columns);
  return printJSON(data);
}

export function fail(message, code = 1) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

export function requireFlag(flags, name) {
  if (flags[name] == null || flags[name] === true) {
    fail(`--${name} is required`);
  }
  return flags[name];
}

export function requireArg(positional, idx, name) {
  if (positional[idx] == null) fail(`<${name}> is required`);
  return positional[idx];
}
