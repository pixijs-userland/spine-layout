type Separator = '.' | ',';

export interface NumberFormat {
    decimals: number;
    decimal: Separator;
    group: Separator | '';
}

export interface NumberInText {
    prefix: string;
    suffix: string;
    value: number;
    format: NumberFormat;
}

const NUMBER = /^([\s\S]*?)(\d(?:[\d.,]*\d)?)([\s\S]*)$/;

const other = (sep: Separator): Separator => (sep === '.' ? ',' : '.');

/**
 * A lone separator followed by exactly three digits reads as a thousands group (`1.000`,
 * `25,000`) unless `like` — the format of the value being counted to — says otherwise.
 */
function formatOf(token: string, like?: NumberFormat): NumberFormat {
    const seps = token.replace(/\d/g, '');
    if (!seps) return { decimals: 0, decimal: like?.decimal ?? '.', group: like?.group ?? '' };

    const last = seps[seps.length - 1] as Separator;
    const decimalsAfter = (sep: Separator) => token.length - token.lastIndexOf(sep) - 1;

    if (seps.includes(other(last))) {
        return { decimals: decimalsAfter(last), decimal: last, group: other(last) };
    }
    if (seps.length > 1) return { decimals: 0, decimal: other(last), group: last };

    const digits = decimalsAfter(last);
    const asDecimal: NumberFormat = { decimals: digits, decimal: last, group: '' };
    const asGroup: NumberFormat = { decimals: 0, decimal: other(last), group: last };
    if (digits !== 3 || token.startsWith(`0${last}`)) return asDecimal;
    if (like?.group === last) return asGroup;
    if (like?.decimal === last && like.decimals > 0) return asDecimal;
    return asGroup;
}

export function findNumber(text: string, like?: NumberFormat): NumberInText | undefined {
    const match = text.match(NUMBER);
    if (!match) return undefined;

    const [, prefix, token, suffix] = match;
    const format = formatOf(token, like);
    const [whole, fraction = ''] = (
        format.group ? token.split(format.group).join('') : token
    ).split(format.decimal);

    return { prefix, suffix, value: Number(`${whole}.${fraction || 0}`), format };
}

export function formatNumber(value: number, { decimals, decimal, group }: NumberFormat): string {
    const [whole, fraction] = value.toFixed(decimals).split('.');
    const grouped = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole;
    return fraction ? `${grouped}${decimal}${fraction}` : grouped;
}
