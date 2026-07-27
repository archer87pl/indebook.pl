namespace Rezio.Demand.Domain;

/// <summary>
/// Skala wydarzenia. UWAGA: Discovery API nie podaje pojemności obiektu ani
/// frekwencji, więc skali NIE zgadujemy z nazwy — wyprowadzamy ją z liczby
/// wydarzeń w rynku danego dnia (patrz EventCollector w module scrapera).
/// To proxy: noc z pięcioma koncertami realnie zapełnia miasto bardziej niż
/// noc z jednym, ale pojedynczy festiwal na 30 tys. osób zostanie
/// niedoszacowany. Docelowo skalę powinna dawać pojemność obiektu.
/// </summary>
public enum EventScale { Small, Medium, Large }

/// <summary>
/// Wydarzenie wpływające na popyt w danym dniu i rynku. Nazwy trafiają do
/// listy driverów, żeby właściciel widział, skąd wzięła się cena.
/// </summary>
public sealed record EventSignal(string Name, EventScale Scale);
