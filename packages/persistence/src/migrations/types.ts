/**
 * Migration shape and the destructiveness classifier (WP-03; controller §7, §21.3(7)).
 *
 * A migration is data: an id, a name, forward statements, backward statements,
 * and a declaration of whether the forward direction destroys anything. Keeping
 * it as data (rather than as a function that "does the migration") is what lets
 * the runner inspect a migration *before* running it, which is the only moment
 * at which refusing is still cheap.
 *
 * ## `destructive` is checked, not trusted
 *
 * A boolean a developer sets is a boolean a developer can set wrongly, and the
 * failure mode is the worst one available here: a `DROP TABLE` labelled
 * `destructive: false` would sail past the §21.3(7) guard and take the evidence
 * with it. So `classifyStatements` reads the SQL and forms its own opinion, and
 * the runner rejects any migration whose declaration disagrees with what its
 * statements actually do.
 *
 * The classifier is deliberately conservative in one direction only: it may call
 * a harmless statement destructive (costing an explicit `destructive: true` plus
 * a down-migration, which is cheap), and it is written so that the statements it
 * could miss are ones that cannot destroy committed rows. It is a guard, not a
 * SQL parser; the runner's rule that *every* migration ships a tested
 * down-migration is what covers the residue.
 */

/** Forward-direction SQL patterns that can destroy committed data. */
const DESTRUCTIVE_PATTERNS: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bDROP\s+TABLE\b/i, why: 'DROP TABLE' },
  { pattern: /\bDROP\s+VIEW\b/i, why: 'DROP VIEW' },
  { pattern: /\bDELETE\s+FROM\b/i, why: 'DELETE FROM' },
  { pattern: /\bTRUNCATE\b/i, why: 'TRUNCATE' },
  { pattern: /\bALTER\s+TABLE\b[\s\S]*\bDROP\b/i, why: 'ALTER TABLE ... DROP' },
  { pattern: /\bALTER\s+TABLE\b[\s\S]*\bRENAME\b/i, why: 'ALTER TABLE ... RENAME' },
  { pattern: /\bUPDATE\b[\s\S]*\bSET\b/i, why: 'UPDATE ... SET' },
];

export interface DestructivenessVerdict {
  readonly destructive: boolean;
  /** Which statement patterns triggered the verdict, for the error message. */
  readonly reasons: readonly string[];
}

export function classifyStatements(statements: readonly string[]): DestructivenessVerdict {
  const reasons = new Set<string>();
  statements.forEach((statement) => {
    DESTRUCTIVE_PATTERNS.forEach(({ pattern, why }) => {
      if (pattern.test(statement)) reasons.add(why);
    });
  });
  return { destructive: reasons.size > 0, reasons: [...reasons].sort() };
}

export interface Migration {
  /** Ascending from 1, gap-free. The applied id *is* the schema version. */
  readonly id: number;
  readonly name: string;
  /**
   * Does the forward direction destroy committed data? Must agree with
   * `classifyStatements(up)`; the runner refuses the migration if it does not.
   */
  readonly destructive: boolean;
  readonly up: readonly string[];
  /**
   * The rollback. Required on every migration, not only destructive ones —
   * controller §16 makes every WP revertable, and a schema change with no way
   * back turns a revertable code change into a one-way data change.
   */
  readonly down: readonly string[];
  /** What the rollback restores, and what it cannot. Read on a bad night. */
  readonly rollbackNote: string;
}

export interface AppliedMigrationRecord {
  readonly id: number;
  readonly name: string;
  readonly appliedAt: string;
}
