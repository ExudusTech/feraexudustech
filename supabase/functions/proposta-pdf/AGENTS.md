# proposta-pdf rules
- Only this function renders proposal PDFs (caller-RLS read first) into the private proposal-pdfs bucket with signed links; defaults live in organizations.proposta_config and src/lib/proposta-config.ts mirrors them (test-enforced).
