-- CIVITAS – Index Definitions
-- Run after 00_schema.sql

CREATE INDEX IF NOT EXISTS idx_dim_location_address
    ON dim_location(full_address_standardized);

CREATE INDEX IF NOT EXISTS idx_dim_location_geo
    ON dim_location USING GIST(geom);

CREATE INDEX IF NOT EXISTS idx_dim_location_hn_sn_zip
    ON dim_location(house_number, street_name, zip);

CREATE INDEX IF NOT EXISTS idx_dim_parcel_id
    ON dim_parcel(parcel_id);

CREATE INDEX IF NOT EXISTS idx_fact_violation_loc
    ON fact_violation(location_sk);

CREATE INDEX IF NOT EXISTS idx_fact_violation_status
    ON fact_violation(violation_status);

CREATE INDEX IF NOT EXISTS idx_fact_violation_date
    ON fact_violation(violation_date);

CREATE INDEX IF NOT EXISTS idx_fact_inspection_loc
    ON fact_inspection(location_sk);

CREATE INDEX IF NOT EXISTS idx_fact_permit_loc
    ON fact_permit(location_sk);

CREATE INDEX IF NOT EXISTS idx_fact_311_loc
    ON fact_311(location_sk);

CREATE INDEX IF NOT EXISTS idx_fact_311_date
    ON fact_311(created_date);

CREATE INDEX IF NOT EXISTS idx_fact_tax_lien_parcel
    ON fact_tax_lien(parcel_sk);

CREATE INDEX IF NOT EXISTS idx_fact_tax_lien_loc
    ON fact_tax_lien(location_sk);

CREATE INDEX IF NOT EXISTS idx_fact_vacant_building_loc
    ON fact_vacant_building(location_sk);

CREATE INDEX IF NOT EXISTS idx_fact_vacant_building_src
    ON fact_vacant_building(source_id);

-- Trigram index for address autocomplete
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_dim_location_address_trgm
    ON dim_location USING GIN (full_address_standardized gin_trgm_ops);
