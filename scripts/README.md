# Scripts

Utility scripts for data management and maintenance.

## recalculate-tss.js

Recalculates TSS (Training Stress Score) for all activities using the updated TrainingPeaks-aligned formulas.

### What it does

This script:
1. Fetches all users and their activities from the database
2. Uses each user's physiological data (HR max, HR rest, LTHR) and sport thresholds (FTP, threshold pace)
3. Recalculates TSS for each activity using the corrected algorithms:
   - **Proper TRIMP coefficients** (gender-specific: 0.64 for males, 0.86 for females)
   - **Default thresholds** (330 s/km for running, 200W for cycling) when user hasn't configured them
   - **Correct NGP/NP algorithms** (trailing 30-second windows)
   - **LTHR default** (88% of HRmax instead of 85%)
4. Updates the database with new TSS values
5. Reports changes (TSS delta and percentage change)

### Usage

```bash
# Run the script
node scripts/recalculate-tss.js

# Or with npm
npm run recalculate-tss
```

### Prerequisites

- `.env.local` file must be configured with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Node.js and `@supabase/supabase-js` package (already in project)

### Output Example

```
🔄 Starting TSS recalculation...

📊 Found 3 users

👤 User 7a8f3d4e... (45 activities)
    ✓ Activity: TSS 85 → 92 (+7, 8.2%)
    ✓ Activity: TSS 120 → 118 (-2, -1.7%)
    ✓ Activity: TSS 0 → 45 (+45, N/A)
    ...

👤 User f2c9e1b5... (28 activities)
    ✓ Activity: TSS 65 → 68 (+3, 4.6%)
    ...

✅ Recalculation complete!
📈 Total activities recalculated: 73
```

### Safety

- The script is **read-only** for activity data (only fetches)
- It only **updates** the `tss` field in the `activities` table
- No activities are deleted or moved
- You can run it multiple times safely (it's idempotent)

### If TSS Increases/Decreases

- **Decreases in rTSS/hrTSS**: Previously using conservative defaults, now using better calibration
- **Increases for female athletes**: Fixed TRIMP coefficient (0.64 → 0.86) properly accounts for female physiology
- **Changes in running/cycling**: Better defaults prevent incorrect method selection

### Troubleshooting

If you get errors:

```bash
# Check env vars are loaded
cat .env.local | grep SUPABASE

# Run with more verbose output (edit script to add console.log)
node scripts/recalculate-tss.js

# Test DB connection
node -e "require('@supabase/supabase-js').createClient('$NEXT_PUBLIC_SUPABASE_URL', '$SUPABASE_SERVICE_ROLE_KEY').from('users').select('count').single()"
```

### When to use this script

- After deploying the TSS corrections
- When user profile data changes significantly
- To validate that recalculations match TrainingPeaks values
- Before running analysis or generating coaching recommendations

### Related

See `plan/tss-fix-plan.md` for detailed explanation of all TSS corrections.
