namespace Rezio.Demand.Domain;

public enum Voivodeship
{
    Dolnoslaskie, KujawskoPomorskie, Lubelskie, Lubuskie, Lodzkie, Malopolskie,
    Mazowieckie, Opolskie, Podkarpackie, Podlaskie, Pomorskie, Slaskie,
    Swietokrzyskie, WarminskoMazurskie, Wielkopolskie, Zachodniopomorskie
}

public static class VoivodeshipNames
{
    private static readonly IReadOnlyDictionary<Voivodeship, string> Names =
        new Dictionary<Voivodeship, string>
        {
            [Voivodeship.Dolnoslaskie] = "dolnośląskie",
            [Voivodeship.KujawskoPomorskie] = "kujawsko-pomorskie",
            [Voivodeship.Lubelskie] = "lubelskie",
            [Voivodeship.Lubuskie] = "lubuskie",
            [Voivodeship.Lodzkie] = "łódzkie",
            [Voivodeship.Malopolskie] = "małopolskie",
            [Voivodeship.Mazowieckie] = "mazowieckie",
            [Voivodeship.Opolskie] = "opolskie",
            [Voivodeship.Podkarpackie] = "podkarpackie",
            [Voivodeship.Podlaskie] = "podlaskie",
            [Voivodeship.Pomorskie] = "pomorskie",
            [Voivodeship.Slaskie] = "śląskie",
            [Voivodeship.Swietokrzyskie] = "świętokrzyskie",
            [Voivodeship.WarminskoMazurskie] = "warmińsko-mazurskie",
            [Voivodeship.Wielkopolskie] = "wielkopolskie",
            [Voivodeship.Zachodniopomorskie] = "zachodniopomorskie",
        };

    public static string Polish(Voivodeship voivodeship) => Names[voivodeship];
}
