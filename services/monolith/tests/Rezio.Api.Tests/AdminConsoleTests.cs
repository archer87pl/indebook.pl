using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class AdminConsoleTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Root_serves_admin_console_html()
    {
        var resp = await _client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains("text/html", resp.Content.Headers.ContentType!.ToString());
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("Rezio", body);
        Assert.Contains("/v1/quote", body); // panel woła realny endpoint
    }
}
