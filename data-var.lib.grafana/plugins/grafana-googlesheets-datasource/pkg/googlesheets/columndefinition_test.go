package googlesheets

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/api/sheets/v4"
)

func loadTestGridData(path string) (*sheets.GridData, error) {
	data, err := loadTestSheet(path)
	if err != nil {
		return nil, err
	}

	sheet := data.Sheets[0].Data[0]

	return sheet, nil
}

func TestColumnDefinition(t *testing.T) {
	sheet, err := loadTestGridData("./testdata/mixed-data.json")
	require.Nil(t, err)

	t.Run("TestDataTypes", func(t *testing.T) {
		t.Run("Mixed types detected", func(t *testing.T) {
			column := NewColumnDefinition(sheet.RowData[0].Values[10].FormattedValue, 10)
			for rowIndex := 1; rowIndex < len(sheet.RowData); rowIndex++ {
				column.CheckCell(sheet.RowData[rowIndex].Values[column.ColumnIndex])
			}

			assert.True(t, column.HasMixedTypes())
			assert.True(t, column.types["STRING"])
			assert.True(t, column.types["NUMBER"])
		})

		t.Run("Mixed types not detected", func(t *testing.T) {
			column := NewColumnDefinition(sheet.RowData[0].Values[0].FormattedValue, 0)
			for rowIndex := 1; rowIndex < len(sheet.RowData); rowIndex++ {
				column.CheckCell(sheet.RowData[rowIndex].Values[column.ColumnIndex])
			}

			assert.False(t, column.HasMixedTypes())
		})
	})

	t.Run("TestUnits", func(t *testing.T) {
		t.Run("Mixed units detected", func(t *testing.T) {
			column := NewColumnDefinition(sheet.RowData[0].Values[11].FormattedValue, 11)
			for rowIndex := 1; rowIndex < len(sheet.RowData); rowIndex++ {
				column.CheckCell(sheet.RowData[rowIndex].Values[column.ColumnIndex])
			}

			assert.True(t, column.HasMixedUnits())
		})

		t.Run("Mixed units not detected", func(t *testing.T) {
			column := NewColumnDefinition(sheet.RowData[0].Values[0].FormattedValue, 0)
			for rowIndex := 1; rowIndex < len(sheet.RowData); rowIndex++ {
				column.CheckCell(sheet.RowData[rowIndex].Values[column.ColumnIndex])
			}

			assert.False(t, column.HasMixedUnits())
		})

		t.Run("Currency unit mapping", func(t *testing.T) {
			const currencyColumnIndex int = 14

			t.Run("SEK", func(t *testing.T) {
				column := NewColumnDefinition("SEK", currencyColumnIndex)
				column.CheckCell(sheet.RowData[1].Values[currencyColumnIndex])
				assert.Equal(t, "currencySEK", column.GetUnit())
			})

			t.Run("USD", func(t *testing.T) {
				column := NewColumnDefinition("USD", currencyColumnIndex)
				column.CheckCell(sheet.RowData[4].Values[currencyColumnIndex])
				assert.Equal(t, "currencyUSD", column.GetUnit())
			})

			t.Run("GBP", func(t *testing.T) {
				column := NewColumnDefinition("GBP", currencyColumnIndex)
				column.CheckCell(sheet.RowData[5].Values[currencyColumnIndex])
				assert.Equal(t, "currencyGBP", column.GetUnit())
			})

			t.Run("EUR", func(t *testing.T) {
				column := NewColumnDefinition("EUR", currencyColumnIndex)
				column.CheckCell(sheet.RowData[6].Values[currencyColumnIndex])
				assert.Equal(t, "currencyEUR", column.GetUnit())
			})

			t.Run("JPY", func(t *testing.T) {
				column := NewColumnDefinition("JPY", currencyColumnIndex)
				column.CheckCell(sheet.RowData[7].Values[currencyColumnIndex])
				assert.Equal(t, "currencyJPY", column.GetUnit())
			})

			t.Run("RUB", func(t *testing.T) {
				column := NewColumnDefinition("RUB", currencyColumnIndex)
				column.CheckCell(sheet.RowData[8].Values[currencyColumnIndex])
				assert.Equal(t, "currencyRUB", column.GetUnit())
			})

			t.Run("CHF", func(t *testing.T) {
				column := NewColumnDefinition("CHF", currencyColumnIndex)
				column.CheckCell(sheet.RowData[9].Values[currencyColumnIndex])
				assert.Equal(t, "currencyCHF", column.GetUnit())
			})

			t.Run("INR", func(t *testing.T) {
				column := NewColumnDefinition("INR", currencyColumnIndex)
				column.CheckCell(sheet.RowData[10].Values[currencyColumnIndex])
				assert.Equal(t, "currencyINR", column.GetUnit())
			})
		})
	})
}
