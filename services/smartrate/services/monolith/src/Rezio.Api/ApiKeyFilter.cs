using System.Security.Cryptography;
using System.Text;

namespace Rezio.Api;

/// <summary>
/// Wymaga nagłówka X-Api-Key na endpointach wołanych spoza sieci prywatnej
/// (RezFlow z Vercela). Gdy klucz nie jest skonfigurowany, filtr przepuszcza —
/// wbudowany panel administratora woła /v1/quote z przeglądarki i nie ma gdzie
/// bezpiecznie trzymać sekretu. Wdrożenie produkcyjne MUSI ustawić klucz.
/// </summary>
public sealed class ApiKeyFilter(IConfiguration configuration) : IEndpointFilter
{
    private const string HeaderName = "X-Api-Key";

    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var expected = configuration["SMARTRATE_API_KEY"];
        if (string.IsNullOrWhiteSpace(expected))
            return await next(context);

        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (!FixedTimeEquals(provided, expected))
            return Results.Problem(statusCode: 401, title: "Unauthorized",
                detail: $"Missing or invalid {HeaderName} header.");

        return await next(context);
    }

    /// <summary>Porównanie w czasie stałym — bez timing-oracle na kluczu.</summary>
    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}

public static class ApiKeyFilterExtensions
{
    public static RouteHandlerBuilder RequireApiKey(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<ApiKeyFilter>();
}
