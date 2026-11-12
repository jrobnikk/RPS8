-- Šolski IS – shema podatkovne baze (MariaDB 11.8)
-- Vsebnik baze to datoteko izvede samodejno ob PRVEM zagonu (prazen volumen),
-- in sicer v bazi, ki je nastavljena v .env (MARIADB_DATABASE, privzeto sola_is).
-- Tabele in stolpci so enaki kot v dokumentu »ER diagram in podatkovna baza«.

SET NAMES utf8mb4;
-- Slovenska kolacija: pravilno razvrščanje č, š, ž; primerjave niso občutljive na velikost črk.
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_slovenian_ci;

CREATE TABLE uporabnik (
  id          INT          NOT NULL AUTO_INCREMENT,
  ime         VARCHAR(50)  NOT NULL,
  priimek     VARCHAR(50)  NOT NULL,
  email       VARCHAR(100) NOT NULL,
  geslo_hash  VARCHAR(100) NOT NULL,            -- bcrypt, nikoli geslo v čistem besedilu
  vloga       ENUM('admin', 'ucitelj', 'ucenec') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_uporabnik_email (email),
  -- Šolske domene: dijaki @dijak.sc-celje.si, zaposleni @sc-celje.si (tretja raven preverjanja,
  -- poleg brskalnika in strežnika). '%@sc-celje.si' se ne ujema z '...@dijak.sc-celje.si'.
  CONSTRAINT chk_uporabnik_domena CHECK (
    (vloga = 'ucenec' AND email LIKE '%@dijak.sc-celje.si')
    OR (vloga IN ('ucitelj', 'admin') AND email LIKE '%@sc-celje.si')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovenian_ci;

CREATE TABLE predmet (
  id     INT          NOT NULL AUTO_INCREMENT,
  naziv  VARCHAR(100) NOT NULL,
  opis   TEXT         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_predmet_naziv (naziv)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovenian_ci;

-- Veznik M:N: kateri učitelj poučuje kateri predmet.
CREATE TABLE ucitelj_predmet (
  uporabnik_id  INT NOT NULL,
  predmet_id    INT NOT NULL,
  PRIMARY KEY (uporabnik_id, predmet_id),
  KEY ix_ucitelj_predmet_predmet (predmet_id),
  CONSTRAINT fk_up_uporabnik FOREIGN KEY (uporabnik_id) REFERENCES uporabnik (id) ON DELETE CASCADE,
  CONSTRAINT fk_up_predmet   FOREIGN KEY (predmet_id)   REFERENCES predmet (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovenian_ci;

-- Veznik M:N: kateri učenec obiskuje kateri predmet.
CREATE TABLE vpis (
  uporabnik_id  INT NOT NULL,
  predmet_id    INT NOT NULL,
  PRIMARY KEY (uporabnik_id, predmet_id),
  KEY ix_vpis_predmet (predmet_id),
  CONSTRAINT fk_vpis_uporabnik FOREIGN KEY (uporabnik_id) REFERENCES uporabnik (id) ON DELETE CASCADE,
  CONSTRAINT fk_vpis_predmet   FOREIGN KEY (predmet_id)   REFERENCES predmet (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovenian_ci;

CREATE TABLE gradivo (
  id               INT          NOT NULL AUTO_INCREMENT,
  predmet_id       INT          NOT NULL,
  nalozil_id       INT          NULL,             -- učitelj, ki je naložil gradivo
  naslov           VARCHAR(150) NOT NULL,
  pot_datoteke     VARCHAR(255) NOT NULL,         -- ime datoteke na disku (ne javna pot)
  datum_nalozitve  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gradivo_predmet (predmet_id),
  KEY ix_gradivo_nalozil (nalozil_id),
  CONSTRAINT fk_gradivo_predmet FOREIGN KEY (predmet_id) REFERENCES predmet (id)   ON DELETE CASCADE,
  CONSTRAINT fk_gradivo_nalozil FOREIGN KEY (nalozil_id) REFERENCES uporabnik (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovenian_ci;

CREATE TABLE oddaja (
  id             INT          NOT NULL AUTO_INCREMENT,
  ucenec_id      INT          NOT NULL,
  predmet_id     INT          NOT NULL,
  naslov_naloge  VARCHAR(150) NOT NULL,
  pot_datoteke   VARCHAR(255) NOT NULL,           -- »Priimek Ime – Naslov.končnica«
  datum_oddaje   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Ponovna oddaja iste naloge posodobi obstoječo vrstico (po potrditvi učenca).
  UNIQUE KEY uk_oddaja_naloga (ucenec_id, predmet_id, naslov_naloge),
  KEY ix_oddaja_predmet (predmet_id),
  CONSTRAINT fk_oddaja_ucenec  FOREIGN KEY (ucenec_id)  REFERENCES uporabnik (id) ON DELETE CASCADE,
  CONSTRAINT fk_oddaja_predmet FOREIGN KEY (predmet_id) REFERENCES predmet (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_slovenian_ci;
