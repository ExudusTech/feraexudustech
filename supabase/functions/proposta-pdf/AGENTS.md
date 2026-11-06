# proposta-pdf rules
- Only this function renders proposal PDFs (caller-RLS read first) into the private proposal-pdfs bucket with signed links; defaults live in organizations.proposta_config and src/lib/proposta-config.ts mirrors them (test-enforced).
- Brand logos live in org-logos under <org>/proposta/ and in proposta_config.logos (group/order); the PDF shows only logos when any exist, never inactive brands, never upscaled past native width.
