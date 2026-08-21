/** Indian UPI VPA — name@bank. Phone numbers and dots are allowed on the left. */
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function normaliseUpiId(value: string): string {
    return value.trim().toLowerCase();
}

export function isValidUpiId(value: string): boolean {
    return UPI_ID.test(normaliseUpiId(value));
}

export function upiIssue(value: string): string | null {
    const id = normaliseUpiId(value);
    if (!id) return 'Enter the UPI ID customers should pay.';
    if (!id.includes('@')) return 'A UPI ID looks like name@okaxis or 98xxxxxxxx@paytm.';
    if (!isValidUpiId(id)) return 'That does not look like a UPI ID. Try name@bank.';
    return null;
}

export function upiPayUri(opts: {
    upiId: string;
    payeeName: string;
    amountInr?: number;
    note?: string;
}): string {
    const params = new URLSearchParams();
    params.set('pa', normaliseUpiId(opts.upiId));
    params.set('pn', opts.payeeName.trim() || 'PageCrafts shop');
    params.set('cu', 'INR');
    if (opts.amountInr && opts.amountInr > 0) {
        params.set('am', opts.amountInr.toFixed(2));
    }
    if (opts.note?.trim()) params.set('tn', opts.note.trim().slice(0, 80));
    return `upi://pay?${params.toString()}`;
}
