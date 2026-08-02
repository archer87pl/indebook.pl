namespace Rezio.Scraper.Domain;

/// <summary>
/// Kodowanie współrzędnych do geohasha. Discovery API przyjmuje pozycję przez
/// parametr `geoPoint` (geohash); starszy `latlong` jest oznaczony jako
/// przestarzały i może zniknąć, więc kodujemy sami — to czysta funkcja, więc
/// nadaje się do domeny i do testów.
/// </summary>
public static class Geohash
{
    private const string Base32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    public static string Encode(double latitude, double longitude, int precision = 7)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(precision, 1);

        double latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
        var hash = new System.Text.StringBuilder(precision);
        var bit = 0;
        var index = 0;
        var evenBit = true; // najpierw dzielimy długość geograficzną

        while (hash.Length < precision)
        {
            if (evenBit)
            {
                var mid = (lngMin + lngMax) / 2;
                if (longitude >= mid) { index = index * 2 + 1; lngMin = mid; }
                else { index *= 2; lngMax = mid; }
            }
            else
            {
                var mid = (latMin + latMax) / 2;
                if (latitude >= mid) { index = index * 2 + 1; latMin = mid; }
                else { index *= 2; latMax = mid; }
            }
            evenBit = !evenBit;

            if (++bit == 5)
            {
                hash.Append(Base32[index]);
                bit = 0;
                index = 0;
            }
        }

        return hash.ToString();
    }
}
