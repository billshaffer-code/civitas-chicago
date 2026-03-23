-- CIVITAS – Neighborhood / Community Area support
-- Chicago has 77 official community areas (stable since 1920s)

-- Reference table for community area boundaries
CREATE TABLE IF NOT EXISTS dim_community_area (
    community_area_id  SMALLINT PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    geom               GEOMETRY(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_area_geom
    ON dim_community_area USING GIST(geom);

-- Add FK on dim_location to link properties to their community area
ALTER TABLE dim_location
    ADD COLUMN IF NOT EXISTS community_area_id SMALLINT
    REFERENCES dim_community_area(community_area_id);

CREATE INDEX IF NOT EXISTS idx_dim_location_ca
    ON dim_location(community_area_id);
