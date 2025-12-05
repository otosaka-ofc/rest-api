import express from "express";
import morgan from "morgan";
import { fetchWeatherApi } from "openmeteo";
import prisma from "./lib/prisma";
import bcrypt from "bcrypt";

const app = express();
const url = "https://api.open-meteo.com/v1/forecast";

app.use(morgan("dev"));
// app.use(secure);
app.use(express.json());

/**
 * Health check / root
 */
app.get("/", (_req, res) => {
    res.json({ message: "API is running" });
});

/**
 * Climate endpoint
 */
app.get("/climate", async (req, res) => {
    try {
        const { latitude, longitude, apikey } = req.query as {
            latitude: string;
            longitude: string;
            apikey: string;
        };

        if (apikey !== "climate") {
            return res.status(401).json({ error: "Invalid API key" });
        }

        const responses = await fetchWeatherApi(url, {
            latitude,
            longitude,
            hourly: "temperature_2m",
            current: [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "is_day",
                "precipitation",
                "rain",
                "showers",
                "snowfall",
                "weather_code",
                "cloud_cover",
                "pressure_msl",
                "surface_pressure",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m",
            ],
        });

        const response = responses[0];
        if (!response) return res.status(404).json({ error: "No data found" });

        const lat = response.latitude();
        const long = response.longitude();
        const elevation = response.elevation();
        const utcOffsetSeconds = response.utcOffsetSeconds();
        const current = response.current()!;
        const hourly = response.hourly()!;

        const weatherData = {
            current: {
                latitude: lat,
                longitude: long,
                elevation,
                utcOffsetSeconds,
                time: new Date(
                    (Number(current.time()) + utcOffsetSeconds) * 1000,
                ),
                temperature_2m: current.variables(0)!.value(),
                relative_humidity_2m: current.variables(1)!.value(),
                apparent_temperature: current.variables(2)!.value(),
                is_day: current.variables(3)!.value(),
                precipitation: current.variables(4)!.value(),
                rain: current.variables(5)!.value(),
                showers: current.variables(6)!.value(),
                snowfall: current.variables(7)!.value(),
                weather_code: current.variables(8)!.value(),
                cloud_cover: current.variables(9)!.value(),
                pressure_msl: current.variables(10)!.value(),
                surface_pressure: current.variables(11)!.value(),
                wind_speed_10m: current.variables(12)!.value(),
                wind_direction_10m: current.variables(13)!.value(),
                wind_gusts_10m: current.variables(14)!.value(),
            },
            hourly: {
                time: Array.from(
                    {
                        length:
                            (Number(hourly.timeEnd()) - Number(hourly.time())) /
                            hourly.interval(),
                    },
                    (_, i) =>
                        new Date(
                            (Number(hourly.time()) +
                                i * hourly.interval() +
                                utcOffsetSeconds) *
                                1000,
                        ),
                ),
                temperature_2m: hourly.variables(0)!.valuesArray(),
            },
        };

        res.json({ data: weatherData });
    } catch (err) {
        console.error("Error fetching climate data:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Create user
 */
app.post("/users", async (req, res) => {
    try {
        const { email, name, password } = req.body as {
            email: string;
            name: string;
            password: string;
        };

        // Check if user exists
        const existUser = await prisma.user.findUnique({ where: { email } });
        if (existUser)
            return res.status(400).json({ message: "User already exists" });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = await prisma.user.create({
            data: { email, name, password: hashedPassword },
        });

        res.status(201).json({
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
        });
    } catch (err) {
        console.error("Error creating user:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Get all users
 */
app.get("/users", async (_req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true },
        });
        res.json(users);
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Update user
 */
app.put("/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { email, name, password } = req.body;

        const user = await prisma.user.findUnique({
            where: {
                id: Number(id),
            },
        });

        const data: { email: string; name: string; password: string } = {
            email: email ?? user?.email,
            name: name ?? user?.name,
            password: (await bcrypt.hash(password, 10)) ?? user?.password,
        };

        const updatedUser = await prisma.user.update({
            where: { id: Number(id) },
            data,
        });

        res.json({
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
        });
    } catch (err: unknown) {
        const error = err as { code?: string };
        console.error("Error updating user:", err);
        if (error.code === "P2025") {
            // Record not found
            return res.status(404).json({ error: "User not found" });
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/users/:id", async (req, res) => {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
        where: {
            id: Number(id),
        },
    });
    if (!user)
        res.status(400).json({
            error: "user not found",
        });
    res.json(user);
});

app.delete("/users/:id", async (req, res) => {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
        where: {
            id: Number(id),
        },
    });
    if (!user)
        res.status(400).json({
            error: "user not found",
        });
    await prisma.user.delete({
        where: {
            id: Number(id),
        },
    });
    res.json({
        message: "deleted user.",
        ...user,
    });
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
        return res.status(400).json({ error: "Invalid password" });
    }

    // Login correcto → devolvemos el usuario sin la contraseña
    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
    });
});

// ! LOCATIONSSSSS
// Crear Location
app.post("/locations", async (req, res) => {
    const {
        userId,
        latitude,
        longitude,
        name,
        description,
        elevation,
        timezone,
    } = req.body;
    try {
        const newLocation = await prisma.location.create({
            data: {
                userId,
                latitude,
                longitude,
                name,
                description,
                elevation,
                timezone,
            },
        });
        res.status(201).json(newLocation);
    } catch (err) {
        console.error("Error creating location:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Obtener todas las Locations
app.get("/locations", async (req, res) => {
    try {
        const allLocations = await prisma.location.findMany({
            include: { user: true }, // incluir info de usuario
        });
        res.json(allLocations);
    } catch (err) {
        console.error("Error fetching locations:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Obtener Location por id
app.get("/locations/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const location = await prisma.location.findUnique({
            where: { id: Number(id) },
            include: { user: true },
        });
        if (!location)
            return res.status(404).json({ error: "Location not found" });
        res.json(location);
    } catch (err) {
        console.error("Error fetching location:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Actualizar Location
app.put("/locations/:id", async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
        const updatedLocation = await prisma.location.update({
            where: { id: Number(id) },
            data,
        });
        res.json(updatedLocation);
    } catch (err) {
        console.error("Error updating location:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Borrar Location
app.delete("/locations/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.location.delete({ where: { id: Number(id) } });
        res.json({ message: "Location deleted" });
    } catch (err) {
        console.error("Error deleting location:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/users/:id/locations", async (req, res) => {
    const { id } = req.params;

    const locations = await prisma.location.findMany({
        where: {
            userId: Number(id),
        },
    });

    res.json(locations);
});

// ! TASKSSSSSS
app.post("/tasks", async (req, res) => {
    try {
        const { userId, title, description } = req.body;

        const newTask = await prisma.task.create({
            data: {
                userId,
                title,
                description,
            },
        });

        res.json(newTask);
    } catch (err) {
        res.status(500).json({ error: "Error creating task", details: err });
    }
});

app.get("/tasks", async (req, res) => {
    try {
        const tasks = await prisma.task.findMany({
            orderBy: { createdAt: "desc" },
            include: { user: true },
        });

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: "Error fetching tasks", details: err });
    }
});

app.get("/tasks/user/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const tasks = await prisma.task.findMany({
            where: { userId: Number(userId) },
            orderBy: { createdAt: "desc" },
        });

        res.json(tasks);
    } catch (err) {
        res.status(500).json({
            error: "Error fetching user tasks",
            details: err,
        });
    }
});

app.get("/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const task = await prisma.task.findUnique({
            where: { id: Number(id) },
        });

        if (!task) return res.status(404).json({ error: "Task not found" });

        res.json(task);
    } catch (err) {
        res.status(500).json({ error: "Error fetching task", details: err });
    }
});

app.put("/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, isCompleted } = req.body;

        const updatedTask = await prisma.task.update({
            where: { id: Number(id) },
            data: {
                title,
                description,
                isCompleted,
            },
        });

        res.json(updatedTask);
    } catch (err) {
        res.status(500).json({ error: "Error updating task", details: err });
    }
});

app.delete("/tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const deletedTask = await prisma.task.delete({
            where: { id: Number(id) },
        });

        res.json(deletedTask);
    } catch (err) {
        res.status(500).json({ error: "Error deleting task", details: err });
    }
});

/**
 * Start server
 */
app.listen(3000, "10.167.78.190", () => {
    console.log("App listening on http://10.167.78.190:3000");
});
