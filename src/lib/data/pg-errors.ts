import { ApiError } from "@/lib/errors/respond";

// Turning database complaints into the right answer (R3 D5).
//
// Every route already answers in the envelope — withRoute catches anything that escapes, so
// there is no bare 500 anywhere. But the envelope has to be *true*: `internal` means "we
// broke", and it is the wrong thing to say when the request referred to a template that
// does not exist. The caller reads `internal` as "retry later, nothing you can do", and the
// person on the other end waits for a fix that is never coming because the fault was in the
// request all along.
//
// So the constraint violations that only a bad request can cause are translated into
// validation_failed, and everything else stays `internal`, which is what it is.

interface DbError {
    code?: string;
    message: string;
}

// Postgres SQLSTATEs that mean "the request asked for something the schema forbids".
const CLIENT_FAULTS: Record<string, string> = {
    "23503": "Something this refers to no longer exists.", // foreign_key_violation
    "23505": "That name is already taken. Choose another.", // unique_violation
    "23514": "Some values were not allowed.", // check_violation
    "22001": "Some text was too long.", // string_data_right_truncation
    // invalid_text_representation — a value that is not the type the column is, which in
    // practice is almost always an id from a URL: /projects/not-a-uuid. Without this it is
    // reported as `internal`, so a typed address becomes "we broke" and a 500 in the logs
    // (R4 D14).
    "22P02": "That address is not valid.",
};

// The same faults by the shape of their message, for the paths where a driver hands back
// text without a SQLSTATE.
const BY_MESSAGE: [RegExp, string][] = [
    [/foreign key constraint/i, "23503"],
    [/duplicate key value|unique constraint/i, "23505"],
    [/violates check constraint/i, "23514"],
    [/value too long/i, "22001"],
    [/invalid input syntax for type uuid/i, "22P02"],
];

/**
 * The ApiError this database error deserves, or null when it is genuinely ours.
 *
 * `message` overrides the generic text: the caller knows what the request was referring to
 * and can say so in words the next layer can show a person.
 */
/**
 * `message` replaces the wording for the fault a caller was expecting, and only that one.
 *
 * It used to replace the wording for all five. So a create-project call that passed "That
 * design is not available any more" said exactly that whether the id was missing, malformed,
 * duplicated, or simply too long -- and one of those, a slug arriving where the column wants
 * a uuid, spent an afternoon looking like an empty templates table because the sentence
 * insisted the design was gone.
 *
 * A caller that wants to reword every fault can still pass a map.
 */
export function clientFault(
    error: DbError,
    message?: string | Partial<Record<string, string>>,
): ApiError | null {
    const code =
        error.code && error.code in CLIENT_FAULTS
            ? error.code
            : BY_MESSAGE.find(([pattern]) => pattern.test(error.message ?? ""))?.[1];

    if (!code) return null;

    const said =
        typeof message === "string"
            ? // A plain string is the caller describing the thing it refers to, which is only
              // true when that thing was not found. Everything else keeps its own words.
              code === "23503"
                ? message
                : CLIENT_FAULTS[code]!
            : message?.[code] ?? CLIENT_FAULTS[code]!;

    return new ApiError("validation_failed", said, error.message);
}
