---
title: "A custom Python tool for building ndjson-content packages"
subtitle: "A Python tool for generating ndjon from formatted SQL files"
excerpt: ""
date: 2023-06-09
author: "3manuek"
draft: false

series: "Python"
tags:
  - Projects
  - Python
  - Golang
layout: single
---

### Description

The [artifact_builder](https://github.com/viadb/artifact_builder) is a tool that converts SQL files 
into a single-packaged ndjson file. It works as a submodule in the targeted repositories -- eg. [pgqueries](https://github.com/ongres/pgqueries) --
, and generates a package of the SQL files to be indexed and stored in a database.

This project has a very specific domain, and it is not for general-purpose use. The ndjson format
was intended for provinding sort of an universal supported type for importing the results into
any kind of data store or search-endpoint.

This is a very generic example on how it can be parsed and stored: 

```go
package storage

// Initial work on the indexer

import (
	"bytes"
	"encoding/json"
	"fmt"

	"internal/types"
	"internal/utils"

	_ "github.com/mattn/go-sqlite3"
)

type Repos struct {
	Engine string
	URL    string
}

// Index downloads JSON files, processes the data and inserts it into
// a SQLite database. It returns an error if any step fails.
func (s *Storage) index(cfg *types.ConfigFile) error {

	urls := make([]types.Repos, 0, len(cfg.Repos))
	for k, v := range cfg.Repos {
		urls = append(urls, types.Repos{Engine: k, URL: v.URL, Version: v.Version})
	}

	// Fetch and process JSON data for each URL
	for _, url := range urls {
		// Fetch JSON data
		jsonData, err := utils.FetchJSON(url.URL)
		if err != nil {
			return fmt.Errorf("error fetching JSON from %s: %v", url, err)
		}
		// Remove BOM (Byte Order Mark) from the beginning of the JSON file, if it exists
		jsonData = bytes.TrimPrefix(jsonData, []byte("\xef\xbb\xbf"))

		m := make(map[string]jsonArtifactRow)
		if err := json.Unmarshal(jsonData, &m); err != nil {
			return fmt.Errorf("error parsing JSON: %v", err)
		}

		// Insert queries into SQLite database
		for queryTitle, row := range m {
			row := &QueriesRow{
				Id:       utils.GetMD5Hash(url.Engine + row.Title + row.FPath + row.Category), // Hash the query
				Engine:   url.Engine,
				Name:     queryTitle,
				Title:    row.Title,
				Doc:      row.Doc,
				DocPath:  row.DocPath,
				FPath:    row.FPath,
				Category: row.Category,
				Query:    row.Query,
			}
			s.insertRowOnConflict(row)  // Here I do a ON CONFLICT QUERY, not the best approach, but practical 
                                        // this use-case.

		}

	}

	return nil
}

```